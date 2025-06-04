const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.get('/', (req, res) => {
  res.send('🎬 FFmpeg API is running');
});

app.post('/image-audio-video', async (req, res) => {
  try {
    const { imageUrl, audioUrl } = req.body;

    if (!imageUrl || !audioUrl) {
      return res.status(400).json({ error: 'imageUrl and audioUrl are required.' });
    }

    const id = uuidv4();
    const imagePath = path.join(__dirname, `${id}.jpg`);
    const audioPath = path.join(__dirname, `${id}.mp3`);
    const videoPath = path.join(__dirname, `${id}.mp4`);

    console.log(`⬇️ Downloading files...`);

    const [imageResp, audioResp] = await Promise.all([
      axios.get(imageUrl, { responseType: 'arraybuffer' }),
      axios.get(audioUrl, { responseType: 'arraybuffer' })
    ]);

    fs.writeFileSync(imagePath, imageResp.data);
    fs.writeFileSync(audioPath, audioResp.data);

    console.log(`✅ Files saved. Starting FFmpeg...`);

    const videoDuration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });

    ffmpeg()
      .addInput(imagePath)
      .loop(videoDuration)
      .addInput(audioPath)
      .videoFilters([
        'zoompan=z=\'min(zoom+0.0015,1.5)\':d=1:x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\'',
        'scale=1080:1920'
      ])
      .outputOptions([
        '-c:v libx264',
        '-tune stillimage',
        '-pix_fmt yuv420p',
        `-t ${videoDuration}`
      ])
      .output(videoPath)
      .on('end', () => {
        console.log(`✅ FFmpeg complete, sending video...`);
        res.sendFile(videoPath, () => {
          fs.unlinkSync(imagePath);
          fs.unlinkSync(audioPath);
          fs.unlinkSync(videoPath);
        });
      })
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err.message);
        res.status(500).json({ error: 'Failed to create video', details: err.message });
      })
      .run();

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    res.status(500).json({ error: 'Unexpected server error', details: error.message });
  }
});

app.listen(10000, () => {
  console.log("Running on port 10000");

});
