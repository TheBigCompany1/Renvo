// mongoTest.js
const { MongoClient, ServerApiVersion } = require('mongodb');

const uri = "mongodb+srv://Renvo:Renvo902@renvo1.lzqqn.mongodb.net/?retryWrites=true&w=majority&appName=Renvo1";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect(); // connect to Atlas
    console.log("Connected to MongoDB Atlas!");

    // Test with a ping
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    // Optional: do a simple insert
    const result = await client.db("renvo").collection("test").insertOne({ test: "hello" });
    console.log("Insert result:", result.insertedId);

  } catch (err) {
    console.error("Connection error:", err);
  } finally {
    await client.close();
  }
}

run();
