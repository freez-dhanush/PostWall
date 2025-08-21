// user.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: String,
    name: String,
    age: Number,
    email: String,
    password: String,
    privacy: { type: String, enum: ['public', 'private'], default: 'public' },
    posts: [{ type: mongoose.Schema.Types.ObjectId, ref: "post" }]
});

module.exports = mongoose.model("user", userSchema);
