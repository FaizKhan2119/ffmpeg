const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const ffmpeg = require('fluent-ffmpeg');
const FormData = require('form-data');
const stream = require('stream');

const app = express();
app.use(express.json({ limit: '50mb' }));

const BASEROW_API_TOKEN = 'ScxWSflaJ1UgCBeI8KC5NRMp8ZBUsjqC';
const BASEROW_TABLE_ID = 560768;
const BASEROW_ROW_ID = 1036455;
const BASEROW_FILE_FIELD_ID = 4508039;

app.get('/', (req, res) => {
  res.send('🎬 FFmpeg API is running');
});

app.post('/image-audio-video', async (req, res) => {
  try {
    const { imageUrl, audioUrl, filename = 'output.mp4' } = req.body;

    if (!imageUrl || !audioUrl) {
      return res.status(400).json({ error: 'imageUrl and audioUrl are required.' });
    }

    console.log('⬇️ Downloading image and audio...');
    const [imageResp, audioResp] = await Promise.all([
      axios.get(imageUrl, { responseType: 'arraybuffer' }),
      axios.get(audioUrl, { responseType: 'arraybuffer' }),
    ]);

    const imageBuffer = Buffer.from(imageResp.data);
    const audioBuffer = Buffer.from(audioResp.data);

    // Get audio duration using ffprobe
    const getAudioDuration = () =>
      new Promise((resolve, reject) => {
        const readableAudioStream = new stream.PassThrough();
        readableAudioStream.end(audioBuffer);

        ffmpeg(readableAudioStream)
          .ffprobe((err, metadata) => {
            if (err) reject(err);
            else resolve(metadata.format.duration);
          });
      });

    const videoDuration = await getAudioDuration();
    console.log(`Audio duration: ${videoDuration}s`);

    // Generate video with ffmpeg in memory and get buffer
    const generateVideoBuffer = () =>
      new Promise((resolve, reject) => {
        const videoChunks = [];
        const readableImageStream = new stream.PassThrough();
        readableImageStream.end(imageBuffer);

        const readableAudioStream = new stream.PassThrough();
        readableAudioStream.end(audioBuffer);

        const command = ffmpeg()
          .input(readableImageStream)
          .inputFormat('image2pipe')
          .loop(videoDuration)
          .input(readableAudioStream)
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
            '-movflags frag_keyframe+empty_moov', // for streaming mp4
          ])
          .format('mp4')
          .on('error', (err) => {
            reject(err);
          })
          .on('end', () => {
            resolve(Buffer.concat(videoChunks));
          })
          .pipe();

        command.on('data', (chunk) => {
          videoChunks.push(chunk);
        });
      });

    console.log('🎥 Generating video buffer...');
    const videoBuffer = await generateVideoBuffer();
    console.log(`✅ Video generated in memory, size: ${videoBuffer.length} bytes`);

    // Upload video buffer to Baserow
    const uploadToBaserow = async () => {
      const form = new FormData();
      form.append(`field_${BASEROW_FILE_FIELD_ID}`, videoBuffer, {
        filename,
        contentType: 'video/mp4',
      });

      const url = `https://api.baserow.io/api/database/rows/table/${BASEROW_TABLE_ID}/${BASEROW_ROW_ID}/`;

      const response = await axios.patch(url, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Token ${BASEROW_API_TOKEN}`,
        },
      });

      return response.data;
    };

    console.log('⬆️ Uploading video to Baserow...');
    const baserowResponse = await uploadToBaserow();
    console.log('✅ Upload complete:', baserowResponse);

    res.json({
      message: 'Video generated and uploaded to Baserow successfully',
      baserowResponse,
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

const PORT = 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
