const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const textract = require('textract');
const stopwords = require('stopword');
const natural = require('natural');

const app = express();
const upload = multer({ dest: 'uploads/' });


const extractTextFromPDF = async (filePath) => {
  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);
  return pdfData.text;
};

const extractTextFromDOCX = (filePath) => {
  return new Promise((resolve, reject) => {
    textract.fromFileWithPath(filePath, (error, text) => {
      if (error) {
        console.error('Error extracting DOCX:', error);
        return reject(error);
      }
      resolve(text);
    });
  });
};


// Function to extract text from TXT
const extractTextFromTXT = (filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
};

// Cosine Similarity Calculation
const cosineSimilarity = (tokens1, tokens2) => {
  const termFreq1 = termFrequency(tokens1);
  const termFreq2 = termFrequency(tokens2);

  const terms = new Set([...Object.keys(termFreq1), ...Object.keys(termFreq2)]);

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (const term of terms) {
    const freq1 = termFreq1[term] || 0;
    const freq2 = termFreq2[term] || 0;

    dotProduct += freq1 * freq2;
    magnitude1 += freq1 * freq1;
    magnitude2 += freq2 * freq2;
  }

  if (magnitude1 === 0 || magnitude2 === 0) return 0;
  return dotProduct / (Math.sqrt(magnitude1) * Math.sqrt(magnitude2));
};

const termFrequency = (tokens) => {
  return tokens.reduce((freq, token) => {
    freq[token] = (freq[token] || 0) + 1;
    return freq;
  }, {});
};

// Preprocess text by removing stopwords and non-alphanumeric characters
const preprocessText = (text) => {
  text = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const words = text.split(/\s+/);
  return stopwords.removeStopwords(words);
};

// Endpoint for plagiarism check
app.post('/check-plagiarism', upload.array('files', 5), async (req, res) => {
  if (!req.files || req.files.length < 2) {
    return res.status(400).send({ error: 'At least two files are required' });
  }

  try {
    const texts = [];
    for (let file of req.files) {
      const filePath = file.path;
      const ext = path.extname(file.originalname).toLowerCase();

      let text = '';
      if (ext === '.pdf') {
        text = await extractTextFromPDF(filePath);
      } else if (ext === '.docx') {
        text = await extractTextFromDOCX(filePath);
      } else if (ext === '.txt') {
        text = extractTextFromTXT(filePath);
      }

      const preprocessedText = preprocessText(text);
      texts.push({ file: file.originalname, text: preprocessedText });
    }

    const plagiarismResults = [];
    const threshold = 0.2;

    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const similarity = cosineSimilarity(texts[i].text, texts[j].text);

        if (similarity >= threshold) {
          plagiarismResults.push({
            document1: texts[i].file,
            document2: texts[j].file,
            similarityPercentage: (similarity * 100).toFixed(2),
          });
        }
      }
    }

    res.json({ message: 'Plagiarism check complete.', plagiarismResults });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Error processing files' });
  }
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
