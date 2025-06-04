const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const inputDir = path.join(__dirname, 'inputs');
const outputDir = path.join(__dirname, 'outputs');

if (!fs.existsSync(inputDir)) fs.mkdirSync(inputDir);
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

// 🧩 Route 1: Merge image + audio with zoom out animation
app.post('/image-audio-video', async (req, res) => {
  const { imageUrl, audioUrl } = req.body;

  if (!imageUrl || !audioUrl) {
    return res.status(400).send('Missing imageUrl or audioUrl');
  }

  const id = uuidv4();
  const imagePath = path.join(inputDir, `${id}.jpg`);
  const audioPath = path.join(inputDir, `${id}.mp3`);
  const outputPath = path.join(outputDir, `final_${id}.mp4`);

  try {
    // Download image
    const imgResp = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(imagePath, imgResp.data);

    // Download audio
    const audioResp = await axios.get(audioUrl, { responseType: 'arraybuffer' });
    fs.writeFileSync(audioPath, audioResp.data);

    // Apply zoom-out + 9:16 scaling
    const zoomFilter = `zoompan=z='if(lte(zoom,1.0),zoom+0.001,zoom)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',scale=1080:1920,setsar=1`;

    ffmpeg()
      .input(imagePath)
      .loop() // Loop infinitely — we cut later with -shortest
      .videoFilters(zoomFilter)
      .input(audioPath)
      .audioCodec('aac')
      .videoCodec('libx264')
      .outputOptions(['-pix_fmt yuv420p', '-shortest'])
      .output(outputPath)
      .on('end', () => {
        fs.unlinkSync(imagePath);
        fs.unlinkSync(audioPath);
        res.download(outputPath, () => fs.unlinkSync(outputPath));
      })
      .on('error', (err) => {
        console.error('ffmpeg error:', err);
        res.status(500).send('Video generation failed');
      })
      .run();

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Download or processing failed');
  }
});

// ✅ Default route
app.get('/', (req, res) => {
  res.send('🎬 FFmpeg API is running');
});

// 🚀 Start server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
