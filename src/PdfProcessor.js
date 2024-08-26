import React, { useState, useEffect } from "react";
import axios from "axios";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf";
import { Worker, Viewer } from "@react-pdf-viewer/core";
import { defaultLayoutPlugin } from "@react-pdf-viewer/default-layout";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/default-layout/lib/styles/index.css";
import styles from "./PdfProcessor.module.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const PdfProcessor = () => {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [extractedText, setExtractedText] = useState("");
  const [modules, setModules] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [extractingText, setExtractingText] = useState(false);
  const [creatingModules, setCreatingModules] = useState(false);
  const [creatingAssessment, setCreatingAssessment] = useState(false);

  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setFileUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
      setPdfError(null);
    } else {
      setFile(null);
      setPdfError("Please select a valid PDF file.");
    }
  };

  const extractTextFromPdf = async (pdfFile) => {
    try {
      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item) => item.str).join(" ");
      }
      return text;
    } catch (error) {
      console.error("Error extracting text from PDF:", error);
      throw new Error("Failed to extract text from PDF");
    }
  };

  const processFile = async () => {
    if (!file) {
      alert("Please select a PDF file");
      return;
    }

    setLoading(true);
    setPdfError(null);
    setExtractedText("");
    setModules(null);
    setAssessment(null);

    try {
      // Extract text
      setExtractingText(true);
      const text = await extractTextFromPdf(file);
      setExtractedText(text);
      setExtractingText(false);

      const openaiApiKey = process.env.REACT_APP_OPENAI_API_KEY;
      const apiUrl = "https://api.openai.com/v1/chat/completions";

      // Create modules
      setCreatingModules(true);
      const extractPrompt = `Create 2 training modules and also in training module give the image links from documents, where each module should be at max 50 words from this text ${text}`;
      const extractResponse = await axios.post(
        apiUrl,
        {
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: extractPrompt }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
        }
      );

      const extractedContent = extractResponse.data.choices[0].message.content;

      const MODULE_JSON = `{
        "machineName": "Name of the machine on which the content is based",
        "modules": [
          {
            "id": "module index",
            "moduleName": "Name of the module",
            "estimatedTime": "estimated time in minutes to complete the module",
            "totalTopics": "total number of topics in the module",
            "shortModuleDescription": "short description of the module",
            "ModuleContent": [
              {
                "id": "ModuleContent index",
                "title": "Title of the topic",
                "titleDescription": "One liner description of the topic",
                "image": "image link which is given in the document",
                "video": "video link which is given in the document",
                "content": "This is the content of the module broken down into smaller parts, must have minimum 200 words"
              }
            ]
          }
        ]
      }`;

      const modulePrompt = `Convert the given content into JSON format. JSON format should be in the following structure: ${MODULE_JSON} Just return JSON and don't send any other message. Here is the text to convert in JSON: ${extractedContent}`;
      const moduleResponse = await axios.post(
        apiUrl,
        {
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: modulePrompt }],
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
        }
      );

      const modulesJson = JSON.parse(
        moduleResponse.data.choices[0].message.content
      );
      setModules(modulesJson);
      setCreatingModules(false);

      // Create assessment
      setCreatingAssessment(true);
      const ASSESSMENT_JSON = `{
        "assessment": {
          "moduleName": "module name",
          "estimatedTime": "estimated time in minutes to complete the assessment",
          "questions": [
            {
              "id": "questions index",
              "question": "Question",
              "difficulty": "easy/medium/hard",
              "info": "additional information about the answer, will use this when user has selected the correct answer, this will be shown as a info",
              "options": [
                {
                  "id": "unique id",
                  "option": "Option 1"
                },
                {
                  "id": "unique id",
                  "option": "Option 2"
                },
                {
                  "id": "unique id",
                  "option": "Option 3"
                },
                {
                  "id": "unique id",
                  "option": "Option 4"
                }
              ],
              "answer": "Correct option id"
            }
          ]
        }
      }`;

      const assessmentPrompt = `Create an mcq assessment for each module in the given content. JSON format should be in the following structure: ${ASSESSMENT_JSON} Just return JSON and don't send any other message. Here is the text to convert in JSON: ${extractedContent}`;
      const assessmentResponse = await axios.post(
        apiUrl,
        {
          model: "gpt-3.5-turbo",
          messages: [{ role: "user", content: assessmentPrompt }],
          response_format: { type: "json_object" },
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openaiApiKey}`,
          },
        }
      );

      const assessmentJson = JSON.parse(
        assessmentResponse.data.choices[0].message.content
      );
      setAssessment(assessmentJson);
      setCreatingAssessment(false);
    } catch (error) {
      console.error("Error processing file:", error);
      setPdfError(
        "An error occurred while processing the file. Please try again."
      );
    } finally {
      setLoading(false);
      setExtractingText(false);
      setCreatingModules(false);
      setCreatingAssessment(false);
    }
  };

  return (
    <div className={styles.container}>
      <span style={{
        width: '100%',
        textAlign: 'center',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: '20px',
      }}>Module Creator</span>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
        }}
      >
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileChange}
          id="file-input"
          className={styles.fileInput}
        />
        <label htmlFor="file-input" className={styles.fileInputLabel}>
          Choose PDF File
        </label>
        <button
          onClick={processFile}
          disabled={loading || !file}
          className={styles.processButton}
        >
          {loading ? "Processing..." : "Process PDF"}
        </button>
      </div>
      {pdfError && <p className={styles.error}>{pdfError}</p>}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          gap: 20,
          height: 'calc(100vh - 200px)',
          flex: 1
        }}
      >
        <div
          className={styles.pdfViewer}
          style={{
            width: '50%',
            height: '100%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          {fileUrl ? (
            <Worker
              workerUrl={`//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`}
            >
              <Viewer
                fileUrl={fileUrl}
                plugins={[defaultLayoutPluginInstance]}
                onError={(error) => {
                  console.error("Error rendering PDF:", error);
                  setPdfError("Failed to render PDF. Please try another file.");
                }}
              />
            </Worker>
          ) : (
            <p className={styles.placeholderText}>Upload a PDF to view it here</p>
          )}
        </div>
        <div
          style={{
            width: '50%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid #ccc',
            borderRadius: '4px',
            overflow: 'auto',
          }}
        >
          {!extractedText && !loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}>
              Process PDF to see extracted data, modules, and assessment
            </div>
          ) : (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {(extractingText || extractedText) && (
                <div className={styles.outputSection}>
                  <h3>Extracted Text</h3>
                  {extractingText ? (
                    <p className={styles.loader}>
                      Extracting text
                      <span>.</span><span>.</span><span>.</span>
                    </p>
                  ) : (
                    <div className={styles.outputContent}>{extractedText}</div>
                  )}
                </div>
              )}
              {(creatingModules || modules) && (
                <div className={styles.outputSection}>
                  <h3>Modules</h3>
                  {creatingModules ? (
                    <p className={styles.loader}>
                      Creating modules
                      <span>.</span><span>.</span><span>.</span>
                    </p>
                  ) : (
                    <pre className={`${styles.outputContent} ${styles.jsonOutput}`}>
                      {JSON.stringify(modules, null, 2)}
                    </pre>
                  )}
                </div>
              )}
              {(creatingAssessment || assessment) && (
                <div className={styles.outputSection}>
                  <h3>Assessment</h3>
                  {creatingAssessment ? (
                    <p className={styles.loader}>
                      Creating assessment
                      <span>.</span><span>.</span><span>.</span>
                    </p>
                  ) : (
                    <pre className={`${styles.outputContent} ${styles.jsonOutput}`}>
                      {JSON.stringify(assessment, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PdfProcessor;
