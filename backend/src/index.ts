import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend is running!', timestamp: new Date().toISOString() });
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express backend!' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});