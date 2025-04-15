const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const stringSimilarity = require('string-similarity');
const cors = require('cors');

// Initialize the
const app = express();
app.use(cors({
  origin: 'https://plagiarism-fraud-detection-wgal.vercel.app',  // Allow your local frontend to make requests
  methods: ['GET', 'POST'],        // Allow only GET and POST methods
  allowedHeaders: ['Content-Type'] // Allow the Content-Type header
}));
// Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// Function to extract text from a PDF file
const extractTextFromPDF = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const data = await pdf(buffer);
  return data.text;
};

// Function to extract text from a DOCX file
const extractTextFromDOCX = async (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
};

// Function to extract text from a TXT file
const extractTextFromTXT = (filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
};

// Function to extract metadata from the file
const extractFileMetadata = (filePath) => {
  const stats = fs.statSync(filePath);
  const fileName = path.basename(filePath);
  const fileSize = (stats.size / 1024).toFixed(2) + ' KB';
  const fileType = path.extname(filePath).substring(1).toUpperCase();
  const modifiedDate = stats.mtime.toLocaleString();

  return {
    fileName,
    fileSize,
    fileType,
    modifiedDate,
  };
};

// Main function to extract text based on file type
const extractText = async (file) => {
  const mimeType = file.mimetype;

  if (mimeType === 'application/pdf') {
    return await extractTextFromPDF(file.path);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return await extractTextFromDOCX(file.path);
  } else if (mimeType === 'text/plain') {
    return extractTextFromTXT(file.path);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
};

// Function to split text into smaller chunks (e.g., sentences, paragraphs, lines)
const splitTextIntoChunks = (text) => {
  return text.split('\n').filter((line) => line.trim() !== ''); // Split by line or paragraph
};

// Function to compare documents and highlight matching sections
const getSimilarSections = (text1, text2) => {
  const threshold = 0.7; // Define the threshold for similarity
  const chunks1 = splitTextIntoChunks(text1);
  const chunks2 = splitTextIntoChunks(text2);

  let similarSections = [];

  chunks1.forEach((chunk1, index1) => {
    chunks2.forEach((chunk2, index2) => {
      const similarity = stringSimilarity.compareTwoStrings(chunk1, chunk2);
      if (similarity >= threshold) {
        similarSections.push({
          section1: chunk1,
          section2: chunk2,
          similarity: (similarity * 100).toFixed(2) + '%',
          location: {
            file1: `Paragraph/Line ${index1 + 1}`,
            file2: `Paragraph/Line ${index2 + 1}`,
          },
        });
      }
    });
  });

  return similarSections;
};

// Function to calculate the average similarity from multiple pairs
const calculateGlobalSimilarity = (similarityScores) => {
  const totalSimilarity = similarityScores.reduce((acc, score) => acc + score, 0);
  const averageSimilarity = totalSimilarity / similarityScores.length;
  return averageSimilarity.toFixed(2); // Round to two decimal places
};

// Route to upload and compare files
app.post('/upload', upload.array('documents', 10), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length < 2) {
      return res.status(400).send({ error: 'At least two files are required for comparison.' });
    }

    const comparisonResults = [];
    let similarityScores = []; // Array to hold similarity scores for each pair

    // Loop through each pair of files for comparison
    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const file1 = files[i];
        const file2 = files[j];

        // Extract text from both files
        const text1 = await extractText(file1);
        const text2 = await extractText(file2);

        // Get similar sections between the two extracted texts
        const similarSections = getSimilarSections(text1, text2);

        // Get file metadata for both files
        const file1Metadata = extractFileMetadata(file1.path);
        const file2Metadata = extractFileMetadata(file2.path);

        // Push the result of the comparison to the result array with original filenames
        comparisonResults.push({
          file1: {
            fileName: file1.originalname, // Using the original filename
            fileSize: file1.size,
            fileType: file1.mimetype,
            modifiedDate: file1.lastModifiedDate,
          },
          file2: {
            fileName: file2.originalname, // Using the original filename
            fileSize: file2.size,
            fileType: file2.mimetype,
            modifiedDate: file2.lastModifiedDate,
          },
          similarity: similarSections.length > 0 ? "Matches Found" : "No significant similarities found",
          similarSections
        });

        // Calculate the similarity for the current file pair and add to scores
        const pairSimilarity = (similarSections.length / Math.max(text1.split('\n').length, text2.split('\n').length)) * 100;
        similarityScores.push(pairSimilarity);
      }
    }

    // Calculate the global similarity
    const globalSimilarity = calculateGlobalSimilarity(similarityScores);

    res.json({
      message: 'Comparison complete',
      results: comparisonResults,
      globalSimilarity: `${globalSimilarity}%`
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: 'An error occurred during comparison.' });
  }
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
