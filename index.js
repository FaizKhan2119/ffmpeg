const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const stream = require('stream');

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

    // Generate temp file paths
    const id = uuidv4();
    const tempImagePath = path.join(__dirname, `${id}.jpg`);

    console.log('⬇️ Downloading image and audio...');

    // Download image and audio as buffers
    const [imageResp, audioResp] = await Promise.all([
      axios.get(imageUrl, { responseType: 'arraybuffer' }),
      axios.get(audioUrl, { responseType: 'arraybuffer' }),
    ]);

    const imageBuffer = Buffer.from(imageResp.data);
    const audioBuffer = Buffer.from(audioResp.data);

    // Save image to disk (temp)
    fs.writeFileSync(tempImagePath, imageBuffer);

    // Get audio duration
    const videoDuration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioBuffer, (err, metadata) => {
        if (err) {
          // Try with temp file fallback
          const tempAudioPath = path.join(__dirname, `${id}.mp3`);
          fs.writeFileSync(tempAudioPath, audioBuffer);
          ffmpeg.ffprobe(tempAudioPath, (e2, meta2) => {
            fs.unlinkSync(tempAudioPath);
            if (e2) reject(e2);
            else resolve(meta2.format.duration);
          });
        } else resolve(metadata.format.duration);
      });
    });

    console.log(`Audio duration: ${videoDuration}s`);
    console.log('⬇️ Starting FFmpeg...');

    // Create readable stream from audio buffer
    const audioStream = new stream.PassThrough();
    audioStream.end(audioBuffer);

    // Prepare to collect video chunks
    const videoChunks = [];

    ffmpeg()
      .input(tempImagePath)
      .loop(videoDuration)
      .input(audioStream)
      .inputFormat('mp3')
      .videoFilters([
        "zoompan=z='min(zoom+0.0015,1.5)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'",
        'scale=1080:1920',
      ])
      .outputOptions([
        '-c:v libx264',
        '-tune stillimage',
        '-pix_fmt yuv420p',
        `-t ${videoDuration}`,
        '-movflags frag_keyframe+empty_moov',
      ])
      .format('mp4')
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err.message);
        fs.unlinkSync(tempImagePath);
        res.status(500).json({ error: 'Failed to create video', details: err.message });
      })
      .on('end', () => {
        fs.unlinkSync(tempImagePath);
        const videoBuffer = Buffer.concat(videoChunks);
        console.log('✅ FFmpeg complete, sending video...');
        res.set({
          'Content-Type': 'video/mp4',
          'Content-Length': videoBuffer.length,
        });
        res.send(videoBuffer);
      })
      .pipe()
      .on('data', (chunk) => {
        videoChunks.push(chunk);
      });

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);
    res.status(500).json({ error: 'Unexpected server error', details: error.message });
  }
});

app.listen(10000, () => {
  console.log('Running on port 10000');
});
