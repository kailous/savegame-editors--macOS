(function(){
	var input=document.getElementById('dir-input');
	var statusText=document.getElementById('status-text');
	var statusDetail=document.getElementById('status-detail');
	var coverList=document.getElementById('cover-list');
	var coverMessage=document.getElementById('cover-message');
	var coverTemplate=document.getElementById('cover-template');
	var lastRootHint=document.getElementById('last-root-hint');
	var currentRoot='';
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

	loadUserSettings().then(autoLoadLastRoot);

	input.addEventListener('change', function(){
		var files=Array.prototype.slice.call(input.files||[]);
		if(!files.length){
			statusText.textContent='尚未选择目录';
			statusDetail.textContent='';
			coverList.innerHTML='';
			coverMessage.textContent='尚未加载封面';
			return;
		}
		var first=files[0];
		var relativePath=first.webkitRelativePath || first.name;
		var root=relativePath.split('/')[0] || '存档目录';
		currentRoot=root;
		var count=files.length;
		statusText.textContent='已选择目录：'+root;
		var samplePaths=files.slice(0,3).map(function(file){return file.webkitRelativePath || file.name;});
		var extra=files.length>3 ? ' 等' : '';
		statusDetail.textContent='包含 '+count+' 个文件，例如：'+samplePaths.join('，')+extra;

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

	function hideContent(){
		var contentEls=document.querySelectorAll('.content');
		contentEls.forEach(function(el){
			el.style.display='none';
		});
	}
	if(typeof window!=='undefined'){
		window.hideContent=hideContent;
	}

	async function autoLoadLastRoot(){
		if(!hasNode || !userSettings.lastSaveRoot){
			return;
		}
		var root=userSettings.lastSaveRoot;
		if(!fs.existsSync(root)){
			coverMessage.textContent='上次的目录不存在：'+root;
			// 调用hideContent()
			if(typeof hideContent==='function'){
				hideContent();
			}
			return;
		}
		coverMessage.textContent='正在读取 '+root+'...';
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
				currentRoot=path.basename(root);
				statusText.textContent='自动加载目录：\n'+root;
				statusDetail.textContent='找到 '+files.length+' 个文件';
				loadCaptions(files, root);
			}else{
				coverMessage.textContent='目录中未找到 slot 相关文件：'+root;
				// 调用hideContent()
				if(typeof hideContent==='function'){
					hideContent();
				}
			}
		}catch(err){
			coverMessage.textContent='读取目录失败：'+err.message;
			// 调用hideContent()
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
				console.warn('写入用户设置失败', err);
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
			alert('无法打开存档：'+err.message);
		}
	}

	async function parseCaption(file){
		var buffer=await file.arrayBuffer();
		var view=new DataView(buffer);
		var jpgOffset=captionReadU32ByHash(view, 0x63696a32);
		if(jpgOffset===null)
			throw new Error('未找到图片偏移');
		var jpgSize=view.getUint32(jpgOffset, true);
		if(jpgOffset+4+jpgSize>buffer.byteLength)
			throw new Error('图片数据不完整');
		var bytes=new Uint8Array(buffer, jpgOffset+4, jpgSize);
		var blob=new Blob([bytes], {type:'image/jpeg'});
		var imgUrl=URL.createObjectURL(blob);

		var year=captionReadU32ByHash(view, 0x9811A3F7);
		var minute=captionReadU32ByHash(view, 0x27853BF7);
		var hour=captionReadU32ByHash(view, 0x23F3D75E);
		var month=captionReadU32ByHash(view, 0xDFD840D3);
		var day=captionReadU32ByHash(view, 0xBD46F485);
		var isAutosave=captionReadBoolByHash(view, 0x25F03CAA);

		var dateText='未知时间';
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

		coverList.innerHTML='';
		coverMessage.textContent='正在读取封面...';

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
			coverMessage.textContent='未找到包含 slot 的目录（缺少 caption.sav）';
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
			return aAuto ? 1 : -1; // 非自动存档排前
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

			var img=card.querySelector('img');
			if(img){
				img.src=captionData.imgUrl;
				img.alt=slot+' 封面';
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
					autosaveEl.textContent='自动存档';
					autosaveEl.style.display='inline-block';
				}else{
					autosaveEl.textContent='';
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
				openBtn.textContent='编辑此存档';
				openBtn.addEventListener('click', function(){
					openSlot(slot, progressFile);
				});
				actions.appendChild(openBtn);
			}else{
				var warn=document.createElement('div');
				warn.className='message';
				warn.style.color='#ffb347';
				warn.textContent='缺少 progress.sav 无法打开';
				actions.appendChild(warn);
			}

			coverList.appendChild(card);
		});

		if(coverList.childElementCount){
			coverMessage.textContent='找到 '+coverList.childElementCount+' 个存档';
		}else{
			coverMessage.textContent='未能解析任何存档';
			// 调用hideContent()
			if(typeof hideContent==='function'){
				hideContent();
			}
		}

		if(errors.length){
			var errorDiv=document.createElement('div');
			errorDiv.className='message error';
			errorDiv.style.color='#ff9f9f';
			errorDiv.textContent='解析出错：'+errors.join('；');
			coverList.parentNode.insertBefore(errorDiv, coverList);
		}
	}
})();
