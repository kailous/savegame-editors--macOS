(function(){
	var input=document.getElementById('dir-input');
	var statusText=document.getElementById('status-text');
	var statusDetail=document.getElementById('status-detail');
	var coverList=document.getElementById('cover-list');
	var coverMessage=document.getElementById('cover-message');
	var coverTemplate=document.getElementById('cover-template');
	var languageSelect=document.getElementById('language-select');
	var hasNode=typeof window.require==='function';
	var fs=null, path=null, appRoot='';
	if(hasNode){
		try{
			fs=require('fs');
			path=require('path');
			appRoot=__dirname || path.resolve('.');
		}catch(_){
			hasNode=false;
		}
	}
	var userSettings={
		lastSaveRoot:'',
		lastSlots:[],
		lastBackupDir:'',
		lastSaveFileName:'',
		updatedAt:''
	};
	var settingsLocalKey='totkUserSettings';
	var totkSettingsKey='zelda-totk-sge-settings';
	var allocatedObjectUrls=[];
	var translations={
		en:{
			'page.title':'Select save directory | Tears of the Kingdom Savegame Editor',
			'page.heading':'Savegame Editor',
			'language.label':'Language',
			'picker.choose':'Choose save directory',
			'status.noSelection':'No directory selected',
			'status.coverNotLoaded':'No covers loaded yet',
			'status.dirSelected':'Selected directory: {root}',
			'status.containsExamples':'Contains {count} files, e.g.: {samples}{extra}',
			'status.extraMore':' etc.',
			'status.autoLoadedDir':'Auto-loaded directory:\n{root}',
			'status.filesFound':'Found {count} files',
			'cover.noSaveYet':'No saves found yet',
			'cover.lastDirMissing':'Last directory not found: {root}',
			'cover.readingDir':'Reading {root}...',
			'cover.noSlotFound':'No slot directory found in {root} (missing caption.sav)',
			'cover.loading':'Loading covers...',
			'cover.readDirFailed':'Failed to read directory: {error}',
			'cover.foundCount':'Found {count} saves',
			'cover.noneParsed':'Could not parse any saves',
			'cover.alt':'{slot} cover',
			'cover.rootName':'Save directory',
			'error.imageOffsetMissing':'Image offset not found',
			'error.imageDataIncomplete':'Image data is incomplete',
			'errors.parsing':'Errors while parsing: {errors}',
			'errors.openSaveFailed':'Cannot open save: {error}',
			'log.writeSettingsFailed':'Failed to write user settings',
			'date.unknown':'Unknown time',
			'cover.autosave':'Autosave',
			'actions.editSave':'Edit this save',
			'actions.progressMissing':'Missing progress.sav; cannot open'
		},
		zh:{
			'page.title':'选择存档目录 | 塞尔达传说：王国之泪 存档编辑器',
			'page.heading':'存档编辑器',
			'language.label':'语言',
			'picker.choose':'选择存档目录',
			'status.noSelection':'尚未选择目录',
			'status.coverNotLoaded':'尚未加载封面',
			'status.dirSelected':'已选择目录：{root}',
			'status.containsExamples':'包含 {count} 个文件，例如：{samples}{extra}',
			'status.extraMore':' 等',
			'status.autoLoadedDir':'自动加载目录：\n{root}',
			'status.filesFound':'找到 {count} 个文件',
			'cover.noSaveYet':'尚未找到存档',
			'cover.lastDirMissing':'上次的目录不存在：{root}',
			'cover.readingDir':'正在读取 {root}...',
			'cover.noSlotFound':'目录中未找到 slot 相关文件：{root}',
			'cover.loading':'正在读取封面...',
			'cover.readDirFailed':'读取目录失败：{error}',
			'cover.foundCount':'找到 {count} 个存档',
			'cover.noneParsed':'未能解析任何存档',
			'cover.alt':'{slot} 封面',
			'cover.rootName':'存档目录',
			'error.imageOffsetMissing':'未找到图片偏移',
			'error.imageDataIncomplete':'图片数据不完整',
			'errors.parsing':'解析出错：{errors}',
			'errors.openSaveFailed':'无法打开存档：{error}',
			'log.writeSettingsFailed':'写入用户设置失败',
			'date.unknown':'未知时间',
			'cover.autosave':'自动存档',
			'actions.editSave':'编辑此存档',
			'actions.progressMissing':'缺少 progress.sav 无法打开'
		},
		zh_alt:null
	};
	translations.zh_alt=translations.zh;
	var currentLang=null;
	var lastStatus={key:'status.noSelection', vars:null};
	var lastStatusDetail={key:null, vars:null};
	var lastCoverMessage={key:'cover.noSaveYet', vars:null};

	function normalizeLang(lang){
		if(!lang){return 'en';}
		var lc=String(lang).toLowerCase();
		if(lc==='zh-cn'){return 'zh';}
		if(lc==='zh-tw'){return 'zh_alt';}
		return lc;
	}

	function getDict(lang){
		if(translations[lang]){return translations[lang];}
		var base=lang && lang.replace(/_.+$/,'');
		if(base && translations[base]){return translations[base];}
		return translations.en;
	}

	function t(key, vars){
		var dict=getDict(currentLang || 'en');
		var fallback=getDict('en');
		var template=(dict && dict[key]) || (fallback && fallback[key]) || key;
		return template.replace(/\{(\w+)\}/g, function(_, k){
			return (vars && vars[k]!=null) ? vars[k] : '';
		});
	}

	function prepareVars(key, vars){
		if(!vars){return vars;}
		if(key==='status.containsExamples'){
			return {
				count: vars.count,
				samples: formatSampleList(Array.isArray(vars.samples)? vars.samples : []),
				extra: vars.hasMore ? t('status.extraMore') : (vars.extra || '')
			};
		}
		return vars;
	}

	function setStatus(key, vars){
		lastStatus={key:key, vars:vars};
		var resolved=prepareVars(key, vars);
		if(statusText){
			statusText.textContent=key ? t(key, resolved) : '';
		}
	}

	function setStatusDetail(key, vars){
		lastStatusDetail={key:key, vars:vars};
		var resolved=prepareVars(key, vars);
		if(statusDetail){
			statusDetail.textContent=key ? t(key, resolved) : '';
		}
	}

	function setCoverMessage(key, vars){
		lastCoverMessage={key:key, vars:vars};
		var resolved=prepareVars(key, vars);
		if(coverMessage){
			coverMessage.textContent=key ? t(key, resolved) : '';
		}
	}

	function formatSampleList(samples){
		if(!Array.isArray(samples)){return '';}
		return (currentLang && currentLang.indexOf('zh')===0) ? samples.join('，') : samples.join(', ');
	}

	function getErrorJoiner(){
		return (currentLang && currentLang.indexOf('zh')===0) ? '；' : '; ';
	}

	function translateCoverCards(){
		if(!coverList || !coverList.children){return;}
		var cards=coverList.children;
		for(var i=0;i<cards.length;i++){
			var card=cards[i];
			var slot=card.getAttribute('data-slot') || '';
			var img=card.querySelector('img');
			if(img){
				img.alt=t('cover.alt',{slot:slot});
			}
			var autosaveEl=card.querySelector('.meta .autosave');
			if(autosaveEl){
				if(autosaveEl.dataset.autosave==='true'){
					autosaveEl.textContent=t('cover.autosave');
					autosaveEl.style.display='inline-block';
				}else{
					autosaveEl.textContent='';
					autosaveEl.style.display='none';
				}
			}
			var openBtn=card.querySelector('button[data-action="open"]');
			if(openBtn){
				openBtn.textContent=t('actions.editSave');
			}
			var warn=card.querySelector('.message[data-action="warn-missing"]');
			if(warn){
				warn.textContent=t('actions.progressMissing');
			}
		}
	}

	function applyTranslations(){
		if(typeof document!=='undefined'){
			document.title=t('page.title');
		}
		var heading=document.querySelector('.title-container p');
		if(heading){
			heading.textContent=t('page.heading');
		}
		var languageLabel=document.querySelector('.language-switch label');
		if(languageLabel){
			languageLabel.textContent=t('language.label');
		}
		var pickerLabel=document.querySelector('label[for="dir-input"]');
		if(pickerLabel){
			pickerLabel.textContent=t('picker.choose');
		}
		setStatus(lastStatus.key, lastStatus.vars);
		setStatusDetail(lastStatusDetail.key, lastStatusDetail.vars);
		setCoverMessage(lastCoverMessage.key, lastCoverMessage.vars);
		translateCoverCards();
	}

	function setLanguage(lang){
		currentLang=normalizeLang(lang) || 'en';
		if(languageSelect){
			languageSelect.value=currentLang;
		}
		writeLanguageSetting(currentLang);
		applyTranslations();
	}

	setLanguage(readLanguageSetting());
	loadUserSettings().then(autoLoadLastRoot);
	setupLanguageSwitcher();

	input.addEventListener('change', function(){
		var files=Array.prototype.slice.call(input.files||[]);
		if(!files.length){
			setStatus('status.noSelection');
			setStatusDetail(null);
			coverList.innerHTML='';
			setCoverMessage('status.coverNotLoaded');
			return;
		}
		var first=files[0];
		var relativePath=first.webkitRelativePath || first.name;
		var root=relativePath.split('/')[0] || t('cover.rootName');
		var count=files.length;
		setStatus('status.dirSelected',{root:root});
		var samplePaths=files.slice(0,3).map(function(file){return file.webkitRelativePath || file.name;});
		var hasMore=files.length>3;
		setStatusDetail('status.containsExamples',{count:count, samples:samplePaths, hasMore:hasMore});

		loadCaptions(files, root);
	});

	async function loadUserSettings(){
		if(hasNode){
			try{
				var diskPath=path.join(appRoot,'user-settings.json');
				if(fs.existsSync(diskPath)){
					var base=JSON.parse(fs.readFileSync(diskPath,'utf8'));
					Object.assign(userSettings, base);
				}
			}catch(_){}
		}else{
			try{
				var res=await fetch('./user-settings.json');
				if(res.ok){
					var base=await res.json();
					Object.assign(userSettings, base);
				}
			}catch(_){}
		}
		try{
			var cached=localStorage.getItem(settingsLocalKey);
			if(cached){
				Object.assign(userSettings, JSON.parse(cached));
			}
		}catch(_){}
	}

	function bufferToArrayBuffer(buf){
		return buf.buffer.slice(buf.byteOffset, buf.byteOffset+buf.byteLength);
	}

	function readLanguageSetting(){
		var lang='en';
		try{
			var cached=localStorage.getItem(totkSettingsKey);
			if(cached){
				var parsed=JSON.parse(cached);
				if(parsed && typeof parsed.lang==='string'){
					lang=(parsed.lang || 'en').toLowerCase();
				}
			}
		}catch(_){}
		return normalizeLang(lang);
	}

	function writeLanguageSetting(lang){
		try{
			var payload={};
			var cached=localStorage.getItem(totkSettingsKey);
			if(cached){
				var parsed=JSON.parse(cached);
				if(parsed && typeof parsed==='object'){
					payload=parsed;
				}
			}
			payload.lang=(lang || 'en').toLowerCase();
			localStorage.setItem(totkSettingsKey, JSON.stringify(payload));
		}catch(_){}
	}

	function setupLanguageSwitcher(){
		if(!languageSelect){
			return;
		}
		languageSelect.addEventListener('change', function(){
			setLanguage(this.value);
		});
	}

	function hideContent(){
		var contentEls=document.querySelectorAll('.content');
		contentEls.forEach(function(el){
			el.style.display='none';
		});
	}
	if(typeof window!=='undefined'){
		window.hideContent=hideContent;
	}

	function cleanupObjectUrls(){
		allocatedObjectUrls.forEach(function(url){
			try{ URL.revokeObjectURL(url); }catch(_){}
		});
		allocatedObjectUrls.length=0;
	}

	async function autoLoadLastRoot(){
		if(!hasNode || !userSettings.lastSaveRoot){
			return;
		}
		var root=userSettings.lastSaveRoot;
		if(!fs.existsSync(root)){
			setCoverMessage('cover.lastDirMissing',{root:root});
			if(typeof hideContent==='function'){
				hideContent();
			}
			return;
		}
		setCoverMessage('cover.readingDir',{root:root});
		try{
			var files=[];
			var entries=fs.readdirSync(root,{withFileTypes:true});
			entries.forEach(function(entry){
				if(entry.isDirectory() && /^slot/i.test(entry.name)){
					var slotDir=path.join(root, entry.name);
					['caption.sav','progress.sav'].forEach(function(fname){
						var full=path.join(slotDir, fname);
						if(fs.existsSync(full)){
							var buf=fs.readFileSync(full);
							files.push({
								name: fname,
								path: full,
								webkitRelativePath: path.join(entry.name, fname).replace(/\\/g,'/'),
								arrayBuffer: async function(){ return bufferToArrayBuffer(buf); }
							});
						}
					});
				}
			});
			if(files.length){
				setStatus('status.autoLoadedDir',{root:root});
				setStatusDetail('status.filesFound',{count:files.length});
				loadCaptions(files, root);
			}else{
				setCoverMessage('cover.noSlotFound',{root:root});
				if(typeof hideContent==='function'){
					hideContent();
				}
			}
		}catch(err){
			setCoverMessage('cover.readDirFailed',{error:err.message});
			if(typeof hideContent==='function'){
				hideContent();
			}
		}
	}

	function persistUserSettings(){
		userSettings.updatedAt=new Date().toISOString();
		try{
			localStorage.setItem(settingsLocalKey, JSON.stringify(userSettings));
		}catch(_){}
		writeSettingsFile(); // best-effort
	}

	async function writeSettingsFile(){
		if(hasNode){
			try{
				var diskPath=path.join(appRoot,'user-settings.json');
				fs.writeFileSync(diskPath, JSON.stringify(userSettings, null, 2), 'utf8');
				return true;
			}catch(err){
				console.warn(t('log.writeSettingsFailed'), err);
				return false;
			}
		}
		return false;
	}

	function findSlotName(pathStr){
		var match=pathStr.match(/(^|[\\/])(slot[^\\/]+)([\\/]|$)/i);
		return match ? match[2] : null;
	}

	function captionReadU32ByHash(view, targetHash){
		for(var i=0x000028; i<0x000001c0; i+=8){
			var hash=view.getUint32(i, true);
			if(hash===targetHash){
				return view.getUint32(i+4, true);
			}
		}
		return null;
	}

	function captionReadBoolByHash(view, targetHash){
		for(var i=0x000028; i<0x000001c0; i+=8){
			var hash=view.getUint32(i, true);
			if(hash===targetHash){
				return view.getUint8(i+4) === 1;
			}
		}
		return false;
	}

	function formatDate(dt){
		try{
			return new Intl.DateTimeFormat(undefined, {
				dateStyle:'short',
				timeStyle:'short'
			}).format(dt);
		}catch(_){
			return dt.toISOString();
		}
	}

	function bufferToBase64(buffer){
		var bytes=new Uint8Array(buffer);
		var chunk=0x8000;
		var binary='';
		for(var i=0;i<bytes.length;i+=chunk){
			binary+=String.fromCharCode.apply(null, bytes.subarray(i,i+chunk));
		}
		return btoa(binary);
	}

	async function openSlot(slot, progressFile){
		try{
			var buffer=await progressFile.arrayBuffer();
			var progressPath = (hasNode && progressFile.path) ? progressFile.path : '';
			var saveRoot='';
			if(progressPath && hasNode){
				var slotDir=path.dirname(progressPath);
				saveRoot=path.dirname(slotDir);
				userSettings.lastSaveRoot=saveRoot;
				userSettings.lastSaveFileName=progressPath;
				persistUserSettings();
			}
			var payload={
				slot:slot,
				fileName:progressFile.name,
				progress:bufferToBase64(buffer),
				filePath:progressPath,
				saveRoot:saveRoot
			};
			window.name='TOTK_PAYLOAD:'+JSON.stringify(payload);
			window.location.href='zelda-totk/index.html';
		}catch(err){
			alert(t('errors.openSaveFailed',{error:err.message}));
		}
	}

	async function parseCaption(file){
		var buffer=await file.arrayBuffer();
		var view=new DataView(buffer);
		var jpgOffset=captionReadU32ByHash(view, 0x63696a32);
		if(jpgOffset===null)
			throw new Error(t('error.imageOffsetMissing'));
		var jpgSize=view.getUint32(jpgOffset, true);
		if(jpgOffset+4+jpgSize>buffer.byteLength)
			throw new Error(t('error.imageDataIncomplete'));
		var bytes=new Uint8Array(buffer, jpgOffset+4, jpgSize);
		var blob=new Blob([bytes], {type:'image/jpeg'});
		var imgUrl=URL.createObjectURL(blob);
		allocatedObjectUrls.push(imgUrl);

		var year=captionReadU32ByHash(view, 0x9811A3F7);
		var minute=captionReadU32ByHash(view, 0x27853BF7);
		var hour=captionReadU32ByHash(view, 0x23F3D75E);
		var month=captionReadU32ByHash(view, 0xDFD840D3);
		var day=captionReadU32ByHash(view, 0xBD46F485);
		var isAutosave=captionReadBoolByHash(view, 0x25F03CAA);

		var dateText=t('date.unknown');
		if(year && month && day && hour!=null && minute!=null){
			var dt=new Date(year, month-1, day, hour, minute);
			dateText=formatDate(dt);
		}

		return {
			imgUrl: imgUrl,
			dateText: dateText,
			isAutosave: isAutosave
		};
	}

	function deriveRootFromFile(file){
		if(!hasNode || !file || !file.path || !path){
			return '';
		}
		var slotDir=path.dirname(file.path);
		return path.dirname(slotDir);
	}

	async function loadCaptions(files, rootName){
		var existingErrors=document.querySelectorAll('.message.error');
		existingErrors.forEach(function(el){el.remove();});

		cleanupObjectUrls();
		coverList.innerHTML='';
		setCoverMessage('cover.loading');

		var captionMap=new Map();
		var progressMap=new Map();
		files.forEach(function(file){
			var relPath=file.webkitRelativePath || file.name;
			var slot=findSlotName(relPath);
			if(slot){
				if(file.name==='caption.sav'){
					captionMap.set(slot, file);
				}else if(file.name==='progress.sav'){
					progressMap.set(slot, file);
				}
			}
		});

		if(!captionMap.size){
			var missingRootName=rootName || t('cover.rootName');
			setCoverMessage('cover.noSlotFound',{root:missingRootName});
			return;
		}

		var derivedRoot='';
		if(hasNode){
			for(const file of captionMap.values()){
				derivedRoot=deriveRootFromFile(file);
				if(derivedRoot){break;}
			}
			if(!derivedRoot){
				for(const file of progressMap.values()){
					derivedRoot=deriveRootFromFile(file);
					if(derivedRoot){break;}
				}
			}
		}
		userSettings.lastSaveRoot=derivedRoot || rootName || '';
		userSettings.lastSlots=Array.from(captionMap.keys());
		persistUserSettings();

		var errors=[];
		var parsedEntries=[];
		for(const [slot, file] of captionMap){
			try{
				var captionData=await parseCaption(file);
				parsedEntries.push({
					slot: slot,
					captionData: captionData,
					progressFile: progressMap.get(slot)
				});
			}catch(err){
				errors.push(slot+': '+err.message);
			}
		}

		parsedEntries.sort(function(a, b){
			var aAuto=a.captionData.isAutosave;
			var bAuto=b.captionData.isAutosave;
			if(aAuto===bAuto){ return 0; }
			return aAuto ? 1 : -1; // non-autosaves first
		});

		parsedEntries.forEach(function(entry){
			var slot=entry.slot;
			var captionData=entry.captionData;
			var card=null;
			if(coverTemplate && coverTemplate.content && coverTemplate.content.firstElementChild){
				card=coverTemplate.content.firstElementChild.cloneNode(true);
			}
			if(!card){
				card=document.createElement('div');
				card.className='cover';
				var fallbackImg=document.createElement('img');
				card.appendChild(fallbackImg);
				var fallbackLabel=document.createElement('div');
				fallbackLabel.className='label';
				card.appendChild(fallbackLabel);
				var fallbackMeta=document.createElement('div');
				fallbackMeta.className='meta';
				card.appendChild(fallbackMeta);
				var fallbackActions=document.createElement('div');
				fallbackActions.className='actions';
				card.appendChild(fallbackActions);
			}
			card.setAttribute('data-slot', slot);

			var img=card.querySelector('img');
			if(img){
				img.src=captionData.imgUrl;
				img.alt=t('cover.alt',{slot:slot});
			}

			var label=card.querySelector('.label');
			if(label){
				label.textContent=slot;
			}

			var meta=card.querySelector('.meta');
			if(meta){
				var dateEl=meta.querySelector('.date');
				if(!dateEl){
					dateEl=document.createElement('span');
					dateEl.className='date';
					meta.appendChild(dateEl);
				}
				dateEl.textContent=captionData.dateText;

				var autosaveEl=meta.querySelector('.autosave');
				if(!autosaveEl){
					autosaveEl=document.createElement('span');
					autosaveEl.className='autosave';
					meta.appendChild(autosaveEl);
				}
				if(captionData.isAutosave){
					autosaveEl.textContent=t('cover.autosave');
					autosaveEl.dataset.autosave='true';
					autosaveEl.style.display='inline-block';
				}else{
					autosaveEl.textContent='';
					autosaveEl.dataset.autosave='false';
					autosaveEl.style.display='none';
				}
			}

			var actions=card.querySelector('.actions');
			if(!actions){
				actions=document.createElement('div');
				actions.className='actions';
				card.appendChild(actions);
			}
			while(actions.firstChild){
				actions.removeChild(actions.firstChild);
			}

			const progressFile=entry.progressFile;
			if(progressFile){
				var openBtn=document.createElement('button');
				openBtn.className='btn block';
				openBtn.dataset.action='open';
				openBtn.textContent=t('actions.editSave');
				openBtn.addEventListener('click', function(){
					openSlot(slot, progressFile);
				});
				actions.appendChild(openBtn);
			}else{
				var warn=document.createElement('div');
				warn.className='message';
				warn.style.color='#ffb347';
				warn.dataset.action='warn-missing';
				warn.textContent=t('actions.progressMissing');
				actions.appendChild(warn);
			}

			coverList.appendChild(card);
		});

		if(coverList.childElementCount){
			setCoverMessage('cover.foundCount',{count:coverList.childElementCount});
		}else{
			setCoverMessage('cover.noneParsed');
			if(typeof hideContent==='function'){
				hideContent();
			}
		}

		if(errors.length){
			var errorDiv=document.createElement('div');
			errorDiv.className='message error';
			errorDiv.style.color='#ff9f9f';
			errorDiv.textContent=t('errors.parsing',{errors:errors.join(getErrorJoiner())});
			coverList.parentNode.insertBefore(errorDiv, coverList);
		}
	}
})();
