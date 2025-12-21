const path = require('path');
const {app, BrowserWindow, shell} = require('electron');

const createWindow = () => {
	const mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 1100,
		minHeight: 700,
		backgroundColor: '#1f1f1f',
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true
		}
	});

	mainWindow.removeMenu();

	const entryFile = path.join(__dirname, 'index.html');
	mainWindow.loadFile(entryFile);

	mainWindow.webContents.setWindowOpenHandler(({url}) => {
		if (url.startsWith('http:') || url.startsWith('https:'))
			shell.openExternal(url);
		return {action: 'deny'};
	});

	mainWindow.webContents.on('will-navigate', (event, url) => {
		if (url.startsWith('http:') || url.startsWith('https:')){
			event.preventDefault();
			shell.openExternal(url);
		}
	});
};

app.whenReady().then(() => {
	createWindow();

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0)
			createWindow();
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin')
		app.quit();
});
