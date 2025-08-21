const express = require('express');
const app = express();
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require("bcrypt");
const jwt = require('jsonwebtoken');
const userModel = require('./models/user');
const postModel = require('./models/post');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/miniproject1")
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection error:", err));

mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
});
mongoose.connection.once('open', () => {
    console.log('Connected to MongoDB');
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: "shhhh",
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// Flash messages for all templates
app.use(function (req, res, next) {
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// --- Auth middleware ---
function isLoggedIn(req, res, next) {
    if (!req.cookies.token || req.cookies.token === "") return res.redirect('/login');
    try {
        const data = jwt.verify(req.cookies.token, "shhhh");
        req.user = data;
        next();
    } catch (e) {
        req.flash('error', 'Session expired');
        return res.redirect('/login');
    }
}

// --- Routes ---

app.get('/', (req, res) => res.render('index'));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async function (req, res) {
    let { name, username, email, age, password } = req.body;
    let user = await userModel.findOne({ email });
    if (user) {
        req.flash('error', 'User already registered');
        return res.redirect('/register');
    }
    bcrypt.genSalt(10, function (err, salt) {
        bcrypt.hash(password, salt, async function (err, hash) {
            let user = await userModel.create({
                name,
                username,
                email,
                age,
                password: hash,
            });
            let token = jwt.sign({ email: email, userid: user._id }, "shhhh");
            res.cookie("token", token);
            req.flash('success', 'Successfully registered!');
            res.redirect('/profile');
        });
    });
});
app.post('/login', async function (req, res) {
    let { email, password } = req.body;
    let user = await userModel.findOne({ email });
    if (!user) {
        req.flash('error', 'User not found');
        return res.redirect('/login');
    }
    bcrypt.compare(password, user.password, function (err, result) {
        if (result) {
            let token = jwt.sign({ email: email, userid: user._id }, "shhhh");
            res.cookie("token", token);
            req.flash('success', 'Successfully logged in!');
            res.redirect("/profile");
        } else {
            req.flash('error', 'Invalid credentials');
            res.redirect('/login');
        }
    });
});
app.get('/logout', function (req, res) {
    res.cookie("token", "");
    req.flash('success', 'Logged out!');
    res.redirect('/login');
});

// Profile and post routes
app.get("/profile", isLoggedIn, async function (req, res) {
    let user = await userModel.findOne({ email: req.user.email })
        .populate("posts");
    res.render("profile", { user });
});

app.post("/profile/privacy", isLoggedIn, async function (req, res) {
    let user = await userModel.findOne({ email: req.user.email });
    user.privacy = req.body.privacy;
    await user.save();
    req.flash('success', 'Privacy setting updated!');
    res.redirect('/profile');
});

app.post("/post", isLoggedIn, async function (req, res) {
    let user = await userModel.findOne({ email: req.user.email });
    let { content } = req.body;
    let post = await postModel.create({
        user: user._id,
        content
    });
    user.posts.push(post._id);
    await user.save();
    req.flash('success', 'Post created!');
    res.redirect("/profile");
});

app.get("/edit/:id", isLoggedIn, async function (req, res) {
    let post = await postModel.findById(req.params.id).populate("user");
    res.render('edit', { post });
});
app.post("/update/:id", isLoggedIn, async function (req, res) {
    await postModel.findOneAndUpdate({ _id: req.params.id }, { content: req.body.content });
    req.flash('success', 'Post updated!');
    res.redirect('/profile');
});

// Like route: redirect to correct profile (own or friend's)
// Profile privacy on public profiles is still supported
app.get("/like/:id", isLoggedIn, async function(req, res){
    let post = await postModel.findById(req.params.id).populate("user");
    let userId = req.user.userid;
    if (!post.likes.map(id => id.toString()).includes(userId)) {
        post.likes.push(userId);
    } else {
        post.likes = post.likes.filter(id => id.toString() !== userId);
    }
    await post.save();
    // If liking on someone's public profile, redirect back there
    if (req.query.username) {
        res.redirect(`/profile/${req.query.username}`);
    } else {
        res.redirect('/profile');
    }
});

// View other user's profile (public/private posts only, no friends logic)
app.get("/profile/:username", isLoggedIn, async function (req, res) {
    let profileUser = await userModel.findOne({ username: req.params.username }).populate("posts");
    if (!profileUser) return res.status(404).send("User not found");

    const viewerId = req.user.userid;
    const isOwner = viewerId === profileUser._id.toString();
    const canView = profileUser.privacy === "public" || isOwner;

    res.render("profile-public", { profileUser, canView, viewer: req.user, isOwner });
});

app.listen(process.env.PORT, () => {
    console.log("Server running at http://localhost:3000");
});