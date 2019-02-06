import { app, BrowserWindow, ipcMain, screen } from "electron";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as url from "url";
import { AppSettings } from "./src/app/models/app.settings";
import { IGetStudySet, IModifyStudySet } from "./src/app/models/app.ipcCommands";
import { IStudySet } from "./src/app/models/app.studySet";
import { SetNotFoundError } from "./src/app/SetNotFoundError";

let win;
let serve;

const args = process.argv.slice(1);
serve = args.some(val => val === "--serve");

// Config values
const CONFIG_PATH = path.join(os.homedir(), ".aslstudy/config.json");
const SETS_PATH = path.join(os.homedir(), ".aslstudy/sets/");

const networkTablesRecieve = (key, value, valueType, msgType, id, flags) => {
  // If value comes in as a string and is supposed to be a boolean, convert it.
  if (value === "true" || value === "false") {
    value = value === "true";
  }

  // Assemble the data received into JSON
  const dataPackage = {
    key,
    value,
    valueType,
    msgType,
    id,
    flags
  };

  console.log("packaging data: " + JSON.stringify(dataPackage));
  // Emit the data to IPC
  win.webContents.send("received", dataPackage);
};

const storeSet = async (studySet: IStudySet): Promise<void> => {
  if(studySet.id === undefined) return;

  await fs.outputJson(path.join(SETS_PATH, studySet.id + ".json"), studySet);
};

const getSets = async (): Promise<IStudySet[]> => {
  let returnData = [];

  const listing = await fs.readdir(SETS_PATH);
  await Promise.all(listing.map(async file => {
    returnData.push(await ((fs.readJson(path.join(SETS_PATH, file)) as unknown) as IStudySet));
  }));

  return returnData;
};

const getSet = async (id: string): Promise<IStudySet> => {
  let set: IStudySet;

  try{
    set = await ((fs.readJson(path.join(SETS_PATH, id + ".json")) as unknown) as IStudySet);
  }catch (e) {
    if (e.code !== "ENOENT") {
      // Rethrow
      throw e;
    }

    throw new SetNotFoundError(id);
  }

  return set;
};

const loadSettings = async () => {
  let settings: AppSettings;

  try {
    // FYI: The <AppSettings><unknown> allows the cast to AppSettings
    settings = await ((fs.readJson(CONFIG_PATH) as unknown) as AppSettings);
  } catch (e) {
    console.debug(e);
    // Check if the file isn't found.
    if (e.code !== "ENOENT") {
      // Rethrow
      throw e;
    }
    // The file doesn't exist... create one.
    console.warn("Generating new config file...");
    // TODO: find things to set
    // Default settings
    settings = {

    };

    await fs.outputJson(CONFIG_PATH, settings);
  }
  return settings;
};

const createWindow = () => {
  // This is needed because of a weird-ass Electron error
  const electronScreen = screen;
  const size = electronScreen.getPrimaryDisplay().workAreaSize;

  // Create the browser window.
  win = new BrowserWindow({
    x: 0,
    y: 0,
    width: size.width,
    height: size.height,
    title: "ASLStudy"
  });
  // Hide the useless Electron menu bar
  win.setMenuBarVisibility(false);

  console.debug(
    "created window with bounds " +
      size.width +
      "x" +
      size.height
  );

  // Serve the web page
  // This needs to point to the Angular /dist/angular folder during dev
  if (serve) {
    require("electron-reload")(__dirname, {
      electron: require(`${__dirname}/../../node_modules/electron`)
    });
    win.loadURL("http://localhost:4200");
  } else {
    console.debug(
      "loading URL: " +
        url.format({
          pathname: path.join(__dirname, "../../dist/angular/index.html"),
          protocol: "file:",
          slashes: true
        })
    );
    win.loadURL(
      url.format({
        pathname: path.join(__dirname, "../../dist/angular/index.html"),
        protocol: "file:",
        slashes: true
      })
    );
  }

  // Read settings from JSON when the IPC requests it
  ipcMain.on("getSettings", event => {
    loadSettings().then(store => {
      console.debug("got store! " + JSON.stringify(store));

      // Emit the settings to the sender
      event.sender.send("settings", store);
    });
  });

  //TODO: on get study sets
  ipcMain.on("getStudySets", event => {
    getSets().then(sets => {
      event.sender.send(sets);
    });
  });

  //TODO: on get study set
  ipcMain.on("getStudySet", (event, data: IGetStudySet) => {
    getSet(data.id).then((data) => {
      event.sender.send(data);
    })
  });

  //TODO: on store study set
  ipcMain.on("storeStudySet", (event, data: IStudySet) => {
    storeSet(data).then(() => {
      event.sender.send({});
    });
  });

  win.webContents.openDevTools();

  // Emitted when the window is closed.
  win.on("closed", () => {
    // Dereference the window object, usually you would store window
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    win = null;
  });
};

try {
  // This method will be called when Electron has finished
  // initialization and is ready to create browser windows.
  // Some APIs can only be used after this event occurs.
  app.on("ready", createWindow);

  // Quit when all windows are closed.
  app.on("window-all-closed", () => {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (win === null) {
      createWindow();
    }
  });
} catch (e) {
  // Catch Error
  // throw e;
}
