
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5030;
const hostname = process.env.HOSTNAME || '0.0.0.0';

// Enable CORS for frontend domains
app.use(cors({
  origin: [
    'https://adinkraatlas.richardseshie.com', // your static frontend
    'http://localhost:3000' // for local dev
  ],
  credentials: true // if you use cookies/auth
}));

// Respond to GET request on the root route
app.get('/', (req, res) => {
  res.send('GET request to the homepage');
});

// Respond to POST request on the root route
app.post('/', (req, res) => {
  res.send('POST request to the homepage');
});

// Respond to GET request on the /about route
app.get('/about', (req, res) => {
  res.send('About page');
});

// Catch all other routes
app.all('*', (req, res) => {
  res.status(404).send('404 - Page not found');
});

// Start the server
app.listen(port, hostname, () => {
  console.log(`listening at http://${hostname}:${port}`);
});

module.exports = app;