// Web 版と同じ要約ロジック（../src/lib/summarize.ts）をそのまま使うため、親のフォルダも見に行く。
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../src/lib");
config.watchFolders = [...(config.watchFolders ?? []), shared];

module.exports = config;
