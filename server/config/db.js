const dns = require('dns');
const mongoose = require('mongoose');

// Some routers/ISP DNS resolvers don't support SRV record lookups, which
// mongodb+srv:// connection strings require. Force Node to use public DNS
// resolvers so the Atlas connection works regardless of local network DNS.
dns.setServers(['8.8.8.8', '1.1.1.1']);

// Mongoose's default is to buffer queries issued before the connection is
// ready and fail them after 10s ("buffering timed out after 10000ms") - this
// is what showed up as the contact form's timeout error. Fail faster (8s)
// with a clearer message instead of hanging the request for the full 10s.
mongoose.set('bufferTimeoutMS', 8000);

async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn(
      '[db] MONGODB_URI is not set. The site will still run, but the blog and ' +
      'consultation form will not be able to read/write data until you add a ' +
      'connection string to your .env file.'
    );
    return;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log('[db] Connected to MongoDB Atlas');
  } catch (err) {
    console.error('[db] Failed to connect to MongoDB:', err.message);
    console.error('[db] Double-check MONGODB_URI in your .env file and that your IP is allow-listed in Atlas > Network Access.');
  }

  mongoose.connection.on('error', (err) => {
    console.error('[db] MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[db] MongoDB connection lost, mongoose will attempt to reconnect automatically.');
  });
}

module.exports = connectDB;
