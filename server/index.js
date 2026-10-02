import express from 'express';
import cors from 'cors';
import multer from 'multer';
import crypto from 'crypto';
import { Queue } from 'bullmq';
import { OllamaEmbeddings } from '@langchain/ollama';
import { QdrantVectorStore } from "@langchain/qdrant";
import { Ollama } from 'ollama'

const OLLAMA_API_KEY =
  process.env.OLLAMA_API_KEY ||
  '7c62c8bbc3274ad4a98677f99eddd200.IirF6hdQ-8EtcM2B7grkhHBf'

const ollama = new Ollama({
  host: 'https://ollama.com',
  headers: {
    Authorization: `Bearer ${OLLAMA_API_KEY}`,
  },
})

const queue = new Queue('file-upload-queue',{
    connection: {
        host: 'localhost',
        port: 6379,
    }
});



const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    crypto.randomBytes(16, function (err, raw) {
      if (err) return cb(err)
      cb(null, file.originalname + '-' + raw.toString('hex'))
    })
  }
})

const upload = multer({ storage: storage })

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.json({status: 'ALL GOOD!'});
});


app.post('/upload/pdf', upload.single('pdf'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  queue.add('file-ready', JSON.stringify({ 
    fileName: req.file.originalname ,
    destination: req.file.destination,
    path: req.file.path, 
}));
  return res.json({ message: 'File uploaded successfully', file: req.file });
});

app.get('/chat', async (req, res) => {
    const userQuery = req.query.message;
    const embeddings = new OllamaEmbeddings({
      model: "nomic-embed-text-v2-moe", // Default value
      baseUrl: "http://localhost:11434", // Default value
    });
     const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: "http://localhost:6333",
        collectionName: "pdf-docs",
      },
    );
    const ret = vectorStore.asRetriever({
        k: 2
    });
    const result = await ret.invoke(userQuery);

    const SYSTEM_PROMPT = `You are a helpful AI Assistant who answers the user query based on the available context from PDF File.
    Context:
    ${JSON.stringify(result)}
    `;

    const chatResult = await ollama.chat({
  model: "gemma4:31b-cloud",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userQuery },
  ],
});
      console.log("chatResult", chatResult);

    return res.json({ 
      message: chatResult.message.content, 
      docs: result
    });
});
app.listen(8000, () => {
  console.log(`Server is running on port ${8000}, http://192.168.1.37:${8000}`);
});