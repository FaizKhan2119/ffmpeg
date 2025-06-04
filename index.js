const axios = require('axios');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');

async function generateVideo(imageUrl, audioUrl) {
  try {
    const id = uuidv4();
    const imagePath = path.join(__dirname, `${id}.jpg`);
    const audioPath = path.join(__dirname, `${id}.mp3`);
    const videoPath = path.join(__dirname, `${id}.mp4`);

    console.log(`⬇️ Downloading image and audio...`);

    const [imageResp, audioResp] = await Promise.all([
      axios.get(imageUrl, { responseType: 'arraybuffer' }),
      axios.get(audioUrl, { responseType: 'arraybuffer' })
    ]);

    fs.writeFileSync(imagePath, imageResp.data);
    fs.writeFileSync(audioPath, audioResp.data);

    console.log(`🔍 Getting duration...`);
    const duration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(audioPath, (err, metadata) => {
        if (err) reject(err);
        else resolve(metadata.format.duration);
      });
    });

    console.log(`⬇️ Starting FFmpeg...`);

    ffmpeg()
      .addInput(imagePath)
      .loop(duration)
      .addInput(audioPath)
      .videoFilters([
        'zoompan=z=\'min(zoom+0.0015,1.5)\':d=1:x=\'iw/2-(iw/zoom/2)\':y=\'ih/2-(ih/zoom/2)\'',
        'scale=1080:1920'
      ])
      .outputOptions([
        '-c:v libx264',
        '-tune stillimage',
        '-pix_fmt yuv420p',
        `-t ${duration}`
      ])
      .output(videoPath)
      .on('end', async () => {
        console.log(`✅ Video created: ${videoPath}`);
        // Optional: Upload to Baserow here
        fs.unlinkSync(imagePath);
        fs.unlinkSync(audioPath);
        fs.unlinkSync(videoPath);
        console.log("✅ Cleaned up.");
      })
      .on('error', (err) => {
        console.error('❌ FFmpeg error:', err.message);
      })
      .run();

  } catch (err) {
    console.error('❌ Error during video creation:', err.message);
  }
}

// 🟢 Trigger this job ONCE when the worker starts
generateVideo('https://static.toiimg.com/photo/msid-121613446,imgsize-1499322.cms', 'https://ttsmp3.com/created_mp3/861b5df98345b56b79e2747223012882.mp3');
