const express = require('express');
const multer = require('multer');
const path = require('path');
const { extractTextFromPDF, extractTextFromDOCX, extractTextFromTXT } = require('./textExtraction');
const { cosineSimilarity } = require('./cosineSimilarity');
const stopwords = require('stopword');
const natural = require('natural');

const app = express();
const upload = multer({ dest: 'uploads/' });

const preprocessText = (text) => {
  // Convert to lowercase and remove non-alphanumeric characters
  text = text.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  
  // Remove stopwords
  const words = text.split(/\s+/);
  const filteredWords = stopwords.removeStopwords(words);
  
  // Return the processed text as an array of words
  return filteredWords;
};

// Route to upload files and check plagiarism
app.post('/check-plagiarism', upload.array('files', 5), async (req, res) => {
  // Check if files are uploaded
  if (!req.files || req.files.length < 2) {
    return res.status(400).send({ error: 'At least two files are required' });
  }

  try {
    // Extract and preprocess text from each uploaded file
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

      console.log(`Extracted Text from ${file.originalname}:`, text); // Log extracted text

      // Preprocess the extracted text
      const preprocessedText = preprocessText(text);
      texts.push({ file: file.originalname, text: preprocessedText });
    }

    // Now check for plagiarism between files using cosine similarity
    const plagiarismResults = [];
    const threshold = 0.2; // Adjust the threshold for similarity
    for (let i = 0; i < texts.length; i++) {
      for (let j = i + 1; j < texts.length; j++) {
        const similarity = cosineSimilarity(texts[i].text, texts[j].text);
        console.log(`Similarity between Document ${i + 1} and Document ${j + 1}:`, similarity); // Log similarity score

        if (similarity >= threshold) {
          plagiarismResults.push({
            document1: texts[i].file,
            document2: texts[j].file,
            similarityPercentage: (similarity * 100).toFixed(2),
            matchingText: getMatchingText(texts[i].text, texts[j].text),
          });
        }
      }
    }

    // Respond with plagiarism results
    res.json({
      message: 'Plagiarism check complete.',
      plagiarismResults,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'Error processing files' });
  }
});

// Helper function to extract matching text snippets
const getMatchingText = (text1, text2) => {
  const matchingText = [];
  const tokenizer = new natural.WordTokenizer();
  const tokens1 = tokenizer.tokenize(text1);
  const tokens2 = tokenizer.tokenize(text2);

  // Find common words between the two tokenized arrays
  const commonWords = tokens1.filter(word => tokens2.includes(word));
  commonWords.forEach(word => {
    const start1 = text1.indexOf(word);
    const end1 = start1 + word.length;
    const start2 = text2.indexOf(word);
    const end2 = start2 + word.length;

    matchingText.push({
      word,
      position: {
        document1: { start: start1, end: end1 },
        document2: { start: start2, end: end2 },
      },
    });
  });

  return matchingText;
};

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
