"use strict";

var fs = require("fs");
var path = require("path");
var Sequelize = require("sequelize");

var env = process.env.NODE_ENV || "development";
var config = require(path.join(__dirname, "..", "config", "config.js"))[env];
var db = {};

// Make sure the folder holding the SQLite file exists before Sequelize opens it.
if (config.dialect === "sqlite" && config.storage && config.storage !== ":memory:") {
  fs.mkdirSync(path.dirname(config.storage), { recursive: true });
}

var sequelize = config.use_env_variable
  ? new Sequelize(process.env[config.use_env_variable], config)
  : new Sequelize(config.database, config.username, config.password, config);

// Listed explicitly rather than discovered by reading this directory.
//
// A bundler that decides what to ship by tracing require() calls — Vercel's
// does — cannot see a directory read, so with fs.readdirSync(__dirname) here the
// model files were liable to be left out of the deployment altogether. That
// fails late and confusingly: the app boots, and the first query dies on
// db.User being undefined.
[
  require("./user"),
  require("./profile")
].forEach(function(define) {
  var model = define(sequelize, Sequelize.DataTypes);
  db[model.name] = model;
});

Object.keys(db).forEach(function(modelName) {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
