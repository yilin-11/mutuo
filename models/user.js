// Using bcryptjs rather than bcrypt so there is no native build step to fight with.
var bcrypt = require("bcryptjs");

var SALT_ROUNDS = 10;

module.exports = function(sequelize, DataTypes) {
  var User = sequelize.define("User", {
    // The email cannot be null, and must be a proper email before creation
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: { msg: "That does not look like a valid email address." },
        notEmpty: { msg: "An email address is required." }
      },
      // Store emails in one canonical form so "Ann@x.com" and "ann@x.com"
      // cannot become two accounts, and so login is not case sensitive.
      set: function(value) {
        this.setDataValue("email", typeof value === "string" ? value.trim().toLowerCase() : value);
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        // Checked before hashing, so the length applies to what the user typed.
        len: { args: [8, 100], msg: "Your password must be at least 8 characters." }
      }
    },
    // When this member last looked at their matches. What makes the count in the
    // nav mean "new since you last looked" rather than "how many you have" — a
    // number that never changes is a number nobody reads twice.
    //
    // Null for a member who has never opened the page, which correctly makes
    // every mutual match they have new to them.
    matchesSeenAt: {
      type: DataTypes.DATE,
      allowNull: true
    }
  });

  // Compares a plaintext password against the stored hash.
  User.prototype.validPassword = function(password) {
    return bcrypt.compareSync(password, this.password);
  };

  // Everything about a user that is safe to send to the browser.
  // Notably not the password hash, which must never leave the server.
  User.prototype.toSafeJSON = function() {
    return { id: this.id, email: this.email };
  };

  // Hash on the way in, on create and on any password change, so a plaintext
  // password can never reach the database.
  function hashPassword(user) {
    if (user.changed("password")) {
      user.password = bcrypt.hashSync(user.password, bcrypt.genSaltSync(SALT_ROUNDS));
    }
  }

  User.addHook("beforeCreate", hashPassword);
  User.addHook("beforeUpdate", hashPassword);

  User.associate = function(models) {
    User.hasOne(models.Profile, { foreignKey: "userId", onDelete: "CASCADE" });
  };

  return User;
};
