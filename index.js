const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ dest: 'uploads/' });

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`FFmpeg API running on port ${PORT}`);
});
