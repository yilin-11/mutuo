// One member marking another as someone they want to swap skills with.
//
// Deliberately one-directional: a row says "this user matched that profile", and
// nothing about it needs the other member's agreement. A pair who have both
// added each other produce two rows, and the API reports that as a mutual match
// — which is the interesting case, and one that costs a second lookup rather
// than an accept/decline flow nobody has asked for yet.
module.exports = function(sequelize, DataTypes) {
  var Match = sequelize.define("Match", {
    // Who did the matching. Always taken from the session, never from a request
    // body, exactly as with Profile.userId.
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    // Whose profile they matched with. A profile rather than a user because
    // that is what the browser is looking at when it asks, and the two are one
    // to one anyway.
    profileId: {
      type: DataTypes.INTEGER,
      allowNull: false
    }
  }, {
    indexes: [
      // The database, not the route handler, is what makes matching the same
      // member twice impossible — a double-tapped button races itself
      // otherwise, in the same way two profile submits used to.
      { unique: true, fields: ["userId", "profileId"] }
    ]
  });

  Match.associate = function(models) {
    Match.belongsTo(models.User, { foreignKey: "userId", onDelete: "CASCADE" });
    Match.belongsTo(models.Profile, { foreignKey: "profileId", onDelete: "CASCADE" });
  };

  return Match;
};
