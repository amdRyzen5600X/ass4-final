const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const session = require('express-session');
const axios = require('axios');
const nodemailer = require('nodemailer');
const app = express();
const PORT = process.env.PORT || 3000;
const Book = require('./database/book');

mongoose.connect('mongodb://localhost/?directConnection=true&serverSelectionTimeoutMS=2000', {   useNewUrlParser: true, 
    useUnifiedTopology: true,  });
const userdb = mongoose.connection;

const transporter = nodemailer.createTransport({
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
        user: 'backendlab3@outlook.com',
        pass: 'passwordforlabwork1.'
    }
});

function sendEmail(to, subject, body) {
    const mailOptions = {
        from: 'backendlab3@outlook.com',
        to: to,
        subject: subject,
        text: body
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log('Error occurred:', error);
        } else {
            console.log('Email sent:', info.response);
        }
    });
}

userdb.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

userdb.once('open', () => {
    console.log('Connected to MongoDB');
});

const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    email: {type: String, unique: true},
    creationDate: { type: Date, default: Date.now },
    password: String,
    role: { type: String, default: 'user' },
    isDeleted: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

app.use(session({
    secret: 'it-2202',
    resave: false,
    saveUninitialized: true
}));


app.use(express.static('public'));

app.set('view engine', 'ejs');

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/", function(req, res) {
    res.redirect("/signup");
});

app.use((req, res, next) => {
    req.session.language = req.session.language || 'en';
    res.locals.language = req.session.language; 
    next();
});


const requireAuth = (req, res, next) => {
    if (req.session && req.session.userId) {
        return next();
    } else {
        res.redirect('/login');
    }
};

const requireAdmin = async (req, res, next) => {
    try {
        if (req.session && req.session.userId) {
            const user = await User.findById(req.session.userId);
            console.log("User role:", user.role);

            if (user && user.role === 'admin') {
                return next();
            } else {
                res.redirect('/main');
            }
        } else {
            res.redirect('/login');
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Error checking user role');
    }
};
app.get("/signup", function(req, res) {
    res.render("signup");
});

app.post('/signup', async (req, res) => {
    const { username, password, email, role } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username: username,
            email: email,
            password: hashedPassword,
            role: role || 'user',
        });

        await newUser.save();

        res.send('Registration successful!');

        sendEmail(email, 'registration', "u've registrated successfully!");
    } catch (error) {
        console.error(error);
        res.send('Error in registration.');
    }
});


app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
    try {
        // Fetch available books from the database
        const books = await Book.find();
        const user = await User.findById(req.session.userId);
        const users = await User.find({ role: { $ne: 'admin' } });


        res.render('admin', {users: users, books: books,  username: user.username });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching books data');
    }
});


app.get('/deleteuser/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);

        if (userToDelete.role === 'admin') {
            return res.status(403).send('Cannot delete admin user');
        }

        const result = await User.findByIdAndDelete(req.params.id);

        if (!result) {
            return res.status(404).send('User not found');
        }


        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send(`Error deleting user: ${error.message}`);
    }
});


app.get('/main', requireAuth, async (req, res) => {
    try {

        const user = await User.findById(req.session.userId);

        // Fetch available books from the database
        const books = await Book.find();


        const googleBooksData = await fetchBookDataFromGoogleBooks('your query here');



        res.render('main', { username: user.username, books: books, googleBooksData: googleBooksData });
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching user data');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(401).send('Invalid username or password');
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            req.session.userId = user._id;
            req.session.language = req.body.language
            requireAdmin(req, res, () => {
                res.redirect('/admin');
            });
        } else {
            return res.status(401).send('Invalid username or password');
        }
    } catch (error) {
        console.error(error);
        return res.status(500).send('Error during login.');
    }
});


app.post('/addbook', async (req, res) => {
    const { title, author, genre } = req.body;

    const newBook = new Book({
        title: title,
        author: author,
        genre: genre,
    });

    try {
        await newBook.save(); 
        res.redirect('/admin');
    } catch (err) {
        console.error(err);
        res.status(500).send('Error saving book to the database');
    }
});


app.get('/deletebook/:id', async (req, res) => {
    try {
        const result = await Book.deleteOne({ _id: req.params.id });

        if (result.deletedCount === 0) {
            // Book with the given ID does not exist
            return res.status(404).send('Book not found');
        }

        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send(`Error deleting book: ${error.message}`);
    }
});


app.get('/getbook/:id', async (req, res) => {
    try {
        const book = await Book.findById(req.params.id);
        res.json(book);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error fetching book details');
    }
});


app.post('/updatebook/:id', async (req, res) => {
    const { title, author, genre } = req.body;

    try {
        const updatedBook = await Book.findByIdAndUpdate(
            req.params.id,
            { title, author, genre },
            { new: true }
        );

        if (!updatedBook) {
            return res.status(404).send('Book not found');
        }

        res.redirect('/admin');
    } catch (error) {
        console.error(error);
        res.status(500).send(`Error updating book: ${error.message}`);
    }
});

async function fetchBookDataFromGoogleBooks(query) {
    try {
        const response = await axios.get('https://www.googleapis.com/books/v1/volumes', {
            params: {
                q: query,
            },
        });

        return response.data.items;
    } catch (error) {
        console.error('Error fetching book data from Google Books API:', error.message);
        throw error;
    }
}

app.post('/setLanguage', (req, res) => {
    const { language } = req.body;
    req.session.language = language;
    res.redirect('/login');
});


app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
