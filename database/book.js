const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  genre: { type: String, required: true },
  creationDate: { type: Date, default: Date.now },
  deletionDate: { type: Date, default: null },
});

const Book = mongoose.model('Book', bookSchema);

module.exports = Book;
