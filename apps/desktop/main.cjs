const { app, BrowserWindow } = require("electron")

const DEFAULT_WORKSPACE_URL = "http://127.0.0.1:3020"

function workspaceUrl() {
  const configured = process.env.KAIJING_WORKSPACE_URL
  if (typeof configured === "string" && configured.trim()) return configured.trim()
  return DEFAULT_WORKSPACE_URL
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "开镜",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadURL(workspaceUrl())
}

app.whenReady().then(() => {
  createWindow()
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})
