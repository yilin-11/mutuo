// A member's public profile: who they are, where they are, what they can teach
// and what they want to learn. Exactly one profile per user, linked by userId.
module.exports = function(sequelize, DataTypes) {
  var Profile = sequelize.define("Profile", {
    // One profile per account. The owner comes from the session, never from the
    // request body, so a member cannot write to someone else's profile.
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "First name is required." },
        len: { args: [1, 60], msg: "First name is too long." }
      }
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Last name is required." },
        len: { args: [1, 60], msg: "Last name is too long." }
      }
    },
    city: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: { msg: "City is required." },
        len: { args: [1, 80], msg: "City is too long." }
      }
    },
    zipCode: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        // Loose on purpose: postal codes outside the US are not five digits.
        is: { args: /^[a-z0-9][a-z0-9 -]{2,11}$/i, msg: "That does not look like a valid postal code." }
      }
    },
    // The skill this member offers to teach.
    teachSkill: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: "Pick a skill you can share." } }
    },
    // The skill this member wants to learn.
    learnSkill: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: { notEmpty: { msg: "Pick a skill you want to learn." } }
    },
    bio: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: { msg: "Tell other members a little about yourself." },
        len: { args: [1, 2000], msg: "Please keep your bio under 2000 characters." }
      }
    }
  });

  // The fields a member is allowed to submit. Anything else in the request body
  // (id, userId, timestamps) is ignored.
  Profile.EDITABLE_FIELDS = [
    "firstName",
    "lastName",
    "city",
    "zipCode",
    "teachSkill",
    "learnSkill",
    "bio"
  ];

  Profile.associate = function(models) {
    Profile.belongsTo(models.User, { foreignKey: "userId", onDelete: "CASCADE" });
  };

  return Profile;
};
