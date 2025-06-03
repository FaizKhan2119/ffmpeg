const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

// Single file convert endpoint
app.post('/convert', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const inputPath = req.file.path;
  const outputFileName = `${req.file.filename}.mp4`;
  const outputPath = path.join('outputs', outputFileName);

  if (!fs.existsSync('outputs')) {
    fs.mkdirSync('outputs');
  }

  ffmpeg(inputPath)
    .output(outputPath)
    .on('end', () => {
      res.download(outputPath, (err) => {
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        if (err) console.error(err);
      });
    })
    .on('error', (err) => {
      console.error(err);
      res.status(500).send('Error processing file.');
      fs.unlinkSync(inputPath);
    })
    .run();
});

// Multiple images to video endpoint
app.post('/images-to-video', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).send('No files uploaded.');
  }

  const tempDir = path.join(__dirname, 'tempImages');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

  // Rename and move files to tempDir as img001.jpg, img002.jpg, ...
  req.files.forEach((file, idx) => {
    const newPath = path.join(tempDir, `img${String(idx + 1).padStart(3, '0')}.jpg`);
    fs.renameSync(file.path, newPath);
  });

  const outputDir = path.join(__dirname, 'outputs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const outputVideo = path.join(outputDir, `video_${Date.now()}.mp4`);

  ffmpeg()
    .input(path.join(tempDir, 'img%03d.jpg'))
    .inputOptions(['-framerate 1']) // 1 frame per second, adjust as needed
    .outputOptions(['-c:v libx264', '-r 30', '-pix_fmt yuv420p'])
    .output(outputVideo)
    .on('end', () => {
      // Cleanup temp images
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Send the video file to client
      res.download(outputVideo, (err) => {
        if (err) console.error(err);
        fs.unlinkSync(outputVideo);
      });
    })
    .on('error', (err) => {
      console.error(err);
      res.status(500).send('Error creating video.');
      fs.rmSync(tempDir, { recursive: true, force: true });
    })
    .run();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg API running on port ${PORT}`);
});
