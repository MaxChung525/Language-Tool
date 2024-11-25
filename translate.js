document.addEventListener('DOMContentLoaded', () => {
    const csvFileInput = document.getElementById('csvFileInput');
    const csvContents = document.getElementById('csvContents');
    const saveButton = document.getElementById('saveButton');
    const previewButton = document.getElementById('previewButton');
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const placeholderImage = document.getElementById('placeholderImage');
    const columnWidthSelector = document.getElementById('columnWidthSelector');

    let csvDataArray = [];
    let originalFileNames = [];

    const widthPresets = {
        narrow: {
            min: 180,
            max: 300
        },
        normal: {
            min: 300,
            max: 600
        },
        wide: {
            min: 400,
            max: 800
        }
    };

    csvFileInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            originalFileNames = Array.from(event.target.files).map(file => file.name);
            fileNameDisplay.textContent = `Files selected: ${originalFileNames.join(', ')}`;
            handleFileUpload(event);
        } else {
            originalFileNames = [];
            fileNameDisplay.textContent = '';
            placeholderImage.style.display = 'block';
            csvContents.style.display = 'none';
            csvDataArray = [];
        }
    });
    saveButton.addEventListener('click', saveChanges);
    previewButton.addEventListener('click', previewChanges);

    function handleFileUpload(event) {
        const files = event.target.files;
        csvDataArray = [];
        csvContents.innerHTML = '';

        // Add file size validation
        const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit
        const invalidFiles = Array.from(files).filter(file => file.size > MAX_FILE_SIZE);
        if (invalidFiles.length > 0) {
            alert(`Following files exceed 10MB limit:\n${invalidFiles.map(f => f.name).join('\n')}`);
            return;
        }

        const filePromises = Array.from(files).map((file, index) => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    try {
                        const content = e.target.result;
                        const csvData = parseCSVSafely(content);
                        resolve({ index, data: csvData });
                    } catch (error) {
                        reject({ file: file.name, error });
                    }
                };

                reader.onerror = () => reject({ file: file.name, error: reader.error });
                reader.readAsText(file, 'UTF-8'); // Explicitly specify UTF-8 encoding
            });
        });

        Promise.all(filePromises.map(p => p.catch(e => e))) // Handle individual file failures
            .then(results => {
                const errors = results.filter(result => result.error);
                if (errors.length > 0) {
                    const errorMessage = errors
                        .map(e => `${e.file}: ${e.error.message}`)
                        .join('\n');
                    alert(`Errors processing files:\n${errorMessage}`);
                    return;
                }

                // Process successful results
                results
                    .filter(result => !result.error)
                    .sort((a, b) => a.index - b.index)
                    .forEach(result => {
                        csvDataArray[result.index] = result.data;
                    });

                // Display content
                csvDataArray.forEach((data, index) => {
                    displayCSVContent(data, index);
                });

                if (csvDataArray.length > 0) {
                    saveButton.disabled = false;
                    previewButton.disabled = false;
                    placeholderImage.style.display = 'none';
                    csvContents.style.display = 'block';
                    adjustContainerWidth(files.length);
                }
            })
            .catch(error => {
                console.error('Error loading files:', error);
                alert('Error loading files. Please try again.');
            });

        // Set CSS variable for file count
        document.documentElement.style.setProperty('--file-count', files.length);

        if (files.length > 0) {
            columnWidthSelector.disabled = false;
            const preset = widthPresets[columnWidthSelector.value];
            updateColumnWidths(preset);
        }
    }

    function parseCSVSafely(content) {
        try {
            // Basic validation
            if (!content || typeof content !== 'string') {
                throw new Error('Invalid CSV content');
            }

            // Remove BOM if present
            content = content.replace(/^\uFEFF/, '');

            // Validate CSV structure
            const issues = validateCSV(content);
            if (issues.length > 0) {
                console.warn('CSV parsing issues:', issues);
            }

            return parseCSV(content);
        } catch (error) {
            console.error('CSV parsing failed:', error);
            throw new Error(`Failed to parse CSV: ${error.message}`);
        }
    }

    function validateCSV(content) {
        const issues = [];
        
        // Check for BOM
        if (content.charCodeAt(0) === 0xFEFF) {
            issues.push('File contains BOM marker (will be automatically removed)');
        }
        
        // Check for unmatched quotes
        const quoteCount = (content.match(/"/g) || []).length;
        if (quoteCount % 2 !== 0) {
            issues.push('Warning: Unmatched quotes detected');
        }
        
        // Check for inconsistent delimiters
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        const commaCount = lines.map(line => (line.match(/,/g) || []).length);
        if (new Set(commaCount).size > 1) {
            issues.push('Warning: Inconsistent number of columns');
        }

        return issues;
    }

    function parseCSV(content) {
        // Split content handling different line endings
        const rows = content.split(/\r?\n/);
        
        return rows
            .filter(row => row.trim() !== '')
            .map((row, rowIndex) => {
                const cells = [];
                let currentCell = '';
                let withinQuotes = false;
                let quoteChar = null;
                let isEscaped = false;

                for (let i = 0; i < row.length; i++) {
                    const char = row[i];
                    const nextChar = row[i + 1];

                    if (isEscaped) {
                        currentCell += char;
                        isEscaped = false;
                        continue;
                    }

                    if (char === '\\') {
                        isEscaped = true;
                        continue;
                    }

                    if ((char === '"' || char === "'")) {
                        if (!withinQuotes) {
                            withinQuotes = true;
                            quoteChar = char;
                        } else if (char === quoteChar) {
                            if (nextChar === quoteChar) {
                                // Handle escaped quotes
                                currentCell += char;
                                i++; // Skip next quote
                            } else {
                                withinQuotes = false;
                                quoteChar = null;
                            }
                        } else {
                            currentCell += char;
                        }
                    } else if (char === ',' && !withinQuotes) {
                        cells.push(currentCell);
                        currentCell = '';
                    } else {
                        currentCell += char;
                    }
                }

                // Handle last cell and trailing comma
                cells.push(currentCell);

                // Warn about unclosed quotes
                if (withinQuotes) {
                    console.warn(`Warning: Unclosed quote in row ${rowIndex + 1}`);
                }

                return cells.map(cell => {
                    // Remove only the outermost quotes if they exist
                    if ((cell.startsWith('"') && cell.endsWith('"')) || 
                        (cell.startsWith("'") && cell.endsWith("'"))) {
                        cell = cell.slice(1, -1);
                    }
                    // Handle escaped characters
                    return cell.replace(/\\(.)/g, '$1');
                });
            });
    }

    function displayCSVContent(data, fileIndex) {
        if (!data || !Array.isArray(data)) {
            console.error(`Invalid data for file index ${fileIndex}:`, data);
            return;
        }

        // Create table on first file
        if (fileIndex === 0) {
            // Get all keys and sort them
            const allKeys = new Set();
            csvDataArray.forEach(data => {
                data.forEach(row => {
                    if (row[0] && row[0] !== 'Key') allKeys.add(row[0]);
                });
            });

            // Custom sorting function
            const sortKeys = (a, b) => {
                const isALetter = /^[a-zA-Z]/.test(a);
                const isBLetter = /^[a-zA-Z]/.test(b);
                
                // If both start with letters, sort alphabetically
                if (isALetter && isBLetter) {
                    return a.localeCompare(b, undefined, {sensitivity: 'base'});
                }
                // If only one starts with letter, it goes first
                if (isALetter) return -1;
                if (isBLetter) return 1;
                // If neither starts with letter, maintain relative order
                return a.localeCompare(b);
            };

            const sortedKeys = Array.from(allKeys).sort(sortKeys);

            // Create table structure
            const table = document.createElement('table');
            table.className = 'translation-table';
            
            // Create thead for sticky header
            const thead = document.createElement('thead');
            const headerRow = document.createElement('tr');
            
            // Create header cells
            const keyHeader = document.createElement('th');
            keyHeader.textContent = 'Key';
            headerRow.appendChild(keyHeader);
            
            originalFileNames.forEach(name => {
                const th = document.createElement('th');
                th.textContent = escapeHtml(name.split('.')[0]);
                headerRow.appendChild(th);
            });
            
            thead.appendChild(headerRow);
            table.appendChild(thead);

            // Create tbody for content
            const tbody = document.createElement('tbody');
            
            // Create rows for each sorted key
            sortedKeys.forEach(key => {
                const row = document.createElement('tr');
                
                // Add key cell
                const keyCell = document.createElement('td');
                keyCell.textContent = key;
                keyCell.className = 'key-cell';
                row.appendChild(keyCell);
                
                // Add empty cells for all files
                for (let i = 0; i < originalFileNames.length; i++) {
                    const cell = document.createElement('td');
                    cell.className = 'translation-cell';
                    
                    const cellContainer = document.createElement('div');
                    cellContainer.className = 'translation-cell-container';
                    
                    const textarea = document.createElement('textarea');
                    textarea.className = 'translation-textarea';
                    textarea.addEventListener('input', updateCSVData);
                    textarea.addEventListener('input', autoResize);
                    
                    // Add translate button
                    const translateButton = document.createElement('button');
                    translateButton.className = 'cell-translate-button';
                    translateButton.innerHTML = '🌐';
                    translateButton.title = 'Translate';
                    
                    const cellTargetLang = getTargetLanguageForColumn(i);
                    translateButton.onclick = () => {
                        translateCell(translateButton, textarea, key, cellTargetLang);
                    };
                    
                    cellContainer.appendChild(textarea);
                    cellContainer.appendChild(translateButton);
                    cell.appendChild(cellContainer);
                    row.appendChild(cell);
                }
                
                tbody.appendChild(row);
            });
            
            table.appendChild(tbody);
            csvContents.innerHTML = '';
            csvContents.appendChild(table);
        }

        // Fill in the translations for the current file
        const table = document.querySelector('.translation-table');
        if (table) {
            table.querySelectorAll('tr').forEach(row => {
                const key = row.cells[0]?.textContent;
                if (key && key !== 'Key') {
                    const translation = data.find(row => row[0] === key)?.[1] || '';
                    const cell = row.cells[fileIndex + 1];
                    if (cell) {
                        const textarea = cell.querySelector('textarea');
                        if (textarea) {
                            textarea.value = translation;
                            textarea.dataset.originalValue = translation;
                            textarea.dataset.original = translation;
                            textarea.dataset.file = fileIndex;
                            textarea.dataset.key = key;
                            textarea.classList.toggle('unmodified', Boolean(translation.trim()));
                            autoResize.call(textarea);
                        }
                    }
                }
            });
        }
    }

    // Helper function to determine target language based on column index
    function getTargetLanguageForColumn(fileIndex) {
        const fileName = originalFileNames[fileIndex];
        // Extract language code from filename (assuming format like "de_AT.csv" or "de-AT.csv")
        const langMatch = fileName.match(/^([a-z]{2})[_-]([a-z]{2})/i);
        if (langMatch) {
            const [, primaryCode, countryCode] = langMatch;
            // Use the country code if it has a mapping, otherwise use the primary code
            const langCode = (primaryCode + countryCode).toLowerCase();
            return languageCodeMap[langCode] || 
                   languageCodeMap[countryCode.toLowerCase()] || 
                   languageCodeMap[primaryCode.toLowerCase()] || 
                   primaryCode.toLowerCase();
        }
        
        // Fallback to simple two-letter code
        const simpleLangMatch = fileName.match(/^([a-z]{2})/i);
        const langCode = simpleLangMatch ? simpleLangMatch[1].toLowerCase() : 'en';
        return languageCodeMap[langCode] || langCode;
    }

    function autoResize() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    }

    function updateCSVData(event) {
        const { file, original, key } = event.target.dataset;
        const fileIndex = parseInt(file);
        
        // Find or create the row in csvDataArray
        let rowIndex = csvDataArray[fileIndex].findIndex(row => row[0] === key);
        if (rowIndex === -1) {
            rowIndex = csvDataArray[fileIndex].length;
            csvDataArray[fileIndex].push([key, '']);
        }
        
        // Update the translation
        csvDataArray[fileIndex][rowIndex][1] = event.target.value;
        
        // Update modified status
        if (event.target.value !== original) {
            event.target.classList.remove('unmodified');
            csvDataArray[fileIndex][rowIndex].isModified = true;
        } else {
            event.target.classList.add('unmodified');
            csvDataArray[fileIndex][rowIndex].isModified = false;
        }
    }

    async function saveChanges() {
        if (window.selectedDirHandle) {
            try {
                // Get the original folder name
                const originalFolderName = window.selectedDirHandle.name;
                
                // Create a new folder name with timestamp
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const defaultFolderName = `${originalFolderName}_modified_${timestamp}`;

                // Show directory picker with suggested name
                const saveHandle = await window.showDirectoryPicker({
                    mode: 'readwrite',
                    startIn: window.selectedDirHandle.parent, // Start in parent directory
                    suggestedName: defaultFolderName // Suggest the folder name
                });

                // Save each file
                for (let index = 0; index < csvDataArray.length; index++) {
                    const translations = [];
                    const table = document.querySelector('.translation-table');
                    
                    table.querySelectorAll('tr').forEach(row => {
                        const key = row.cells[0]?.textContent;
                        const translationCell = row.cells[index + 1]?.querySelector('textarea');
                        
                        if (key && key !== 'Key' && translationCell) {
                            const translation = translationCell.value.trim();
                            if (translation) {
                                translations.push([key, translation]);
                            }
                        }
                    });

                    const csvContent = translations
                        .map(([key, translation]) => `"${escapeCSV(key)}","${escapeCSV(translation)}"`)
                        .join('\n');

                    const fileHandle = await saveHandle.getFileHandle(originalFileNames[index], { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
                    await writable.close();
                }

                alert(`Files saved successfully in folder: ${saveHandle.name}`);
            } catch (err) {
                if (err.name === 'AbortError') return; // User cancelled the save
                console.error('Error saving files:', err);
                // Fallback to download method
                saveChangesDownload();
            }
        } else {
            // If no folder was selected, use the original save method
            if ('showDirectoryPicker' in window) {
                try {
                    const dirHandle = await window.showDirectoryPicker({
                        mode: 'readwrite'
                    });

                    // Save each file
                    for (let index = 0; index < csvDataArray.length; index++) {
                        const translations = [];
                        const table = document.querySelector('.translation-table');
                        
                        table.querySelectorAll('tr').forEach(row => {
                            const key = row.cells[0]?.textContent;
                            const translationCell = row.cells[index + 1]?.querySelector('textarea');
                            
                            if (key && key !== 'Key' && translationCell) {
                                const translation = translationCell.value.trim();
                                if (translation) {
                                    translations.push([key, translation]);
                                }
                            }
                        });

                        const csvContent = translations
                            .map(([key, translation]) => `"${escapeCSV(key)}","${escapeCSV(translation)}"`)
                            .join('\n');

                        const fileHandle = await dirHandle.getFileHandle(originalFileNames[index], { create: true });
                        const writable = await fileHandle.createWritable();
                        await writable.write(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
                        await writable.close();
                    }

                    alert('Files saved successfully!');
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    console.error('Error saving files:', err);
                    // Fallback to download method
                    saveChangesDownload();
                }
            } else {
                // Fallback for browsers without File System Access API
                saveChangesDownload();
            }
        }
    }

    function saveChangesDownload() {
        csvDataArray.forEach((csvData, index) => {
            const nonEmptyTranslations = [];
            const table = document.querySelector('.translation-table');
            
            table.querySelectorAll('tr').forEach(row => {
                const key = row.cells[0]?.textContent;
                const translationCell = row.cells[index + 1]?.querySelector('textarea');
                
                if (key && key !== 'Key' && translationCell) {
                    const translation = translationCell.value.trim();
                    if (translation) {
                        nonEmptyTranslations.push([key, translation]);
                    }
                }
            });

            const csvContent = nonEmptyTranslations
                .map(([key, translation]) => `"${escapeCSV(key)}","${escapeCSV(translation)}"`)
                .join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = originalFileNames[index];
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }

    // Update escapeCSV to handle just the content within quotes
    function escapeCSV(value) {
        if (!value) return '';
        return value.replace(/"/g, '""'); // Double up quotes only
    }

    function previewChanges() {
        const previewWindow = window.open('', '_blank');
        let previewContent = `
            <html>
            <head>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        padding: 20px; 
                    }
                    .preview-container {
                        display: flex;
                        gap: 20px;
                        overflow-x: auto;
                        padding-bottom: 20px;
                    }
                    .file-content {
                        flex: 1;
                        min-width: 300px;
                    }
                    table { 
                        border-collapse: collapse; 
                        width: 100%; 
                        margin-bottom: 30px; 
                    }
                    th, td { 
                        border: 1px solid #ddd; 
                        padding: 8px; 
                        text-align: left;
                        white-space: pre-wrap;
                        word-break: break-word;
                    }
                    th { 
                        background-color: #f4f4f4; 
                    }
                    .modified-cell { 
                        background-color: #fff3cd; 
                    }
                    h1 { 
                        margin-bottom: 20px; 
                    }
                    h2 {
                        margin-top: 0;
                    }
                </style>
            </head>
            <body>
                <h1>Translation Preview</h1>
                <div class="preview-container">
        `;

        csvDataArray.forEach((csvData, index) => {
            const nonEmptyTranslations = [];
            const table = document.querySelector('.translation-table');
            
            table.querySelectorAll('tr').forEach(row => {
                const key = row.cells[0]?.textContent;
                const translationCell = row.cells[index + 1]?.querySelector('textarea');
                
                if (key && key !== 'Key' && translationCell) {
                    const translation = translationCell.value.trim();
                    if (translation) {
                        const originalValue = (translationCell.dataset.originalValue || '').trim();
                        const isModified = translation !== originalValue;
                        
                        nonEmptyTranslations.push([key, translation, isModified]);
                    }
                }
            });

            previewContent += `
                <div class="file-content">
                    <h2>File ${index + 1}: ${originalFileNames[index]}</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Key</th>
                                <th>Translation</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${nonEmptyTranslations
                                .map(([key, translation, isModified]) => `
                                    <tr>
                                        <td>${escapeHtml(key)}</td>
                                        <td class="${isModified ? 'modified-cell' : ''}">${escapeHtml(translation)}</td>
                                    </tr>
                                `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        });

        previewContent += `
                </div>
            </body>
            </html>
        `;

        previewWindow.document.write(previewContent);
        previewWindow.document.close();
    }

    function adjustContainerWidth(fileCount) {
        const container = document.querySelector('.container');
        const minWidth = Math.min(window.innerWidth - 40, (fileCount + 1) * 220); // 220px per column
        container.style.width = `${minWidth}px`;
    }

    // Add resize handler
    window.addEventListener('resize', () => {
        if (originalFileNames.length > 0) {
            adjustContainerWidth(originalFileNames.length);
        }
    });

    // Initially hide the CSV content and show the placeholder image
    csvContents.style.display = 'none';
    placeholderImage.style.display = 'block';

    function addTranslationFeatures() {
        // Create translation controls container
        const translationControls = document.createElement('div');
        translationControls.className = 'translation-controls';
        
        // Add language selector
        const languageSelector = document.createElement('select');
        languageSelector.id = 'targetLanguage';
        const languages = {
            'cs': 'Czech',
            'de': 'German',
            'es': 'Spanish',
            'fr': 'French',
            'it': 'Italian',
            'ja': 'Japanese',
            'ko': 'Korean',
            'pl': 'Polish',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'zh': 'Chinese'
        };
        
        Object.entries(languages).forEach(([code, name]) => {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = name;
            languageSelector.appendChild(option);
        });

        // Add translate button
        const translateButton = document.createElement('button');
        translateButton.id = 'translateButton';
        translateButton.textContent = 'Auto Translate';
        translateButton.className = 'action-button';

        // Add progress indicator
        const progressIndicator = document.createElement('div');
        progressIndicator.id = 'translationProgress';
        progressIndicator.className = 'progress-indicator';
        progressIndicator.style.display = 'none';

        translationControls.appendChild(languageSelector);
        translationControls.appendChild(translateButton);
        translationControls.appendChild(progressIndicator);

        // Insert controls before the CSV contents
        document.querySelector('.container').insertBefore(
            translationControls, 
            document.getElementById('csvContents')
        );

        // Add event listeners
        translateButton.addEventListener('click', handleTranslation);
    }

    // Configuration object for translation settings
    const translationConfig = {
        apiKey: '',
        apiEndpoint: 'https://translation.googleapis.com/language/translate/v2',
        batchSize: 10, // Number of translations to process at once
        delayBetweenBatches: 1000, // Milliseconds to wait between batches
    };

    async function handleTranslation() {
        const translateButton = document.getElementById('translateButton');
        const progressIndicator = document.getElementById('translationProgress');
        const targetLanguage = document.getElementById('targetLanguage').value;

        try {
            translateButton.disabled = true;
            progressIndicator.style.display = 'block';

            // Get all untranslated or empty cells
            const translationCells = Array.from(document.querySelectorAll('.translation-cell textarea'))
                .filter(textarea => !textarea.value.trim() || textarea.classList.contains('unmodified'));

            if (translationCells.length === 0) {
                alert('No empty or unmodified translations found.');
                return;
            }

            // Group cells into batches
            const batches = [];
            for (let i = 0; i < translationCells.length; i += translationConfig.batchSize) {
                batches.push(translationCells.slice(i, i + translationConfig.batchSize));
            }

            // Process batches
            let completedCount = 0;
            for (const batch of batches) {
                await processBatch(batch, targetLanguage);
                completedCount += batch.length;
                updateProgress(completedCount, translationCells.length);
                await delay(translationConfig.delayBetweenBatches);
            }

            alert('Translation completed successfully!');

        } catch (error) {
            console.error('Translation error:', error);
            alert(`Translation failed: ${error.message}`);
        } finally {
            translateButton.disabled = false;
            progressIndicator.style.display = 'none';
        }
    }

    async function processBatch(textareas, targetLanguage) {
        try {
            // Get source texts from corresponding key cells
            const translations = await Promise.all(
                textareas.map(async textarea => {
                    const keyCell = textarea.closest('tr').querySelector('.key-cell');
                    const sourceText = keyCell.textContent;
                    return translateText(sourceText, 'en', targetLanguage);
                })
            );

            // Update textareas with translations
            textareas.forEach((textarea, index) => {
                if (translations[index]) {
                    textarea.value = translations[index];
                    textarea.classList.remove('unmodified');
                    textarea.dispatchEvent(new Event('input')); // Trigger update handlers
                }
            });

        } catch (error) {
            console.error('Batch translation error:', error);
            throw error;
        }
    }

    // Create a single translation API call function
    async function callTranslationAPI(bodyData) {
        const response = await fetch(`${translationConfig.apiEndpoint}?key=${translationConfig.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Translation API Error Details:', errorData);
            throw new Error(`Translation API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        return response.json();
    }

    // Update the translateText and translateCell functions to use this
    async function translateText(text, sourceLang, targetLang) {
        // Map the target language code before making the API call
        const mappedTargetLang = languageCodeMap[targetLang.toLowerCase()] || targetLang;
        
        // Don't translate if source and target languages are the same
        if (sourceLang === mappedTargetLang) {
            console.log('Source and target languages are the same, skipping translation');
            return text;
        }

        const bodyData = {
            q: text,
            target: mappedTargetLang,
            format: 'text'
        };
        if (sourceLang && sourceLang !== 'auto') {
            bodyData.source = sourceLang;
        }
        
        const data = await callTranslationAPI(bodyData);
        return data.data.translations[0].translatedText;
    }

    function updateProgress(completed, total) {
        const progressIndicator = document.getElementById('translationProgress');
        const percentage = Math.round((completed / total) * 100);
        progressIndicator.textContent = `Translating: ${percentage}% (${completed}/${total})`;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Add this function to handle individual cell translations
    async function translateCell(button, textarea, sourceText, targetLang) {
        const originalButtonHtml = button.innerHTML;
        
        try {
            // Show loading state
            button.disabled = true;
            button.classList.add('translating');
            button.innerHTML = ''; // Clear button content while loading

            const data = await callTranslationAPI({
                q: sourceText,
                target: targetLang,
                format: 'text'
            });
            
            // Update textarea
            textarea.value = data.data.translations[0].translatedText;
            textarea.classList.remove('unmodified');
            textarea.dispatchEvent(new Event('input'));
            
            // Show success state briefly
            button.innerHTML = '✓';
            button.classList.add('success');
            
            // Reset button after delay
            setTimeout(() => {
                button.innerHTML = originalButtonHtml;
                button.classList.remove('success');
            }, 1500);

        } catch (error) {
            console.error('Translation error:', error);
            // Show error state
            button.innerHTML = '⚠️';
            button.classList.add('error');
            
            // Reset button after delay
            setTimeout(() => {
                button.innerHTML = originalButtonHtml;
                button.classList.remove('error');
            }, 3000);
        } finally {
            button.disabled = false;
            button.classList.remove('translating');
        }
    }

    // Add these styles for error states
    const additionalStyles = `
        .cell-translate-button.success {
            background-color: #4CAF50;
            color: white;
        }

        .cell-translate-button.error {
            background-color: #f44336;
            color: white;
        }

        .translation-error-tooltip {
            position: absolute;
            top: -28px;
            right: 0;
            background: #f44336;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            white-space: nowrap;
            z-index: 3;
        }
    `;

    // Add the styles to the document
    const styleSheet = document.createElement('style');
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);

    // Add rate limiting utility
    const rateLimiter = {
        queue: [],
        processing: false,
        maxConcurrent: 5,
        delay: 500, // ms between translations

        async add(task) {
            return new Promise((resolve, reject) => {
                this.queue.push({ task, resolve, reject });
                this.process();
            });
        },

        async process() {
            if (this.processing) return;
            this.processing = true;

            while (this.queue.length > 0) {
                const batch = this.queue.splice(0, this.maxConcurrent);
                await Promise.all(batch.map(async ({ task, resolve, reject }) => {
                    try {
                        const result = await task();
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }));
                
                if (this.queue.length > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.delay));
                }
            }

            this.processing = false;
        }
    };

    // Add this language mapping
    const languageCodeMap = {
        'de': 'de',    // German
        'en': 'en',    // English
        'es': 'es',    // Spanish
        'fr': 'fr',    // French
        'it': 'it',    // Italian
        'ja': 'ja',    // Japanese
        'ko': 'ko',    // Korean
        'zh': 'zh',    // Chinese
        'vi': 'vi',    // Vietnamese
        'th': 'th',    // Thai
        'ru': 'ru',    // Russian
        'pt': 'pt',    // Portuguese
        'nl': 'nl',    // Dutch
        'ar': 'ar',    // Arabic
        'at': 'de',    // Map AT to German (de)
        'deat': 'de',  // German (Austria)
        'dech': 'de',  // German (Switzerland)
        'cz': 'cs',    // Map CZ to Czech (cs)
        'cs': 'cs',    // Czech
        'pl': 'pl',    // Polish
        'hu': 'hu',    // Hungarian
        'ro': 'ro',    // Romanian
        'sk': 'sk',    // Slovak
        'sl': 'sl',    // Slovenian
        'bg': 'bg',    // Bulgarian
        'hr': 'hr',    // Croatian
        'uk': 'uk',    // Ukrainian
        'tr': 'tr',    // Turkish
        'jp': 'ja',    // Map JP to JA
        // Add more mappings as needed
    };

    // Modify the file processing function
    function handleFileSelect(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        // Display selected file names
        const fileNameDisplay = document.getElementById('fileNameDisplay');
        fileNameDisplay.textContent = Array.from(files).map(file => file.name).join(', ');

        // Process each file
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const text = e.target.result;
                
                // Extract language code from filename (first two characters)
                const targetLang = file.name.substring(0, 2).toLowerCase();
                
                // Map the language code if needed (e.g., 'at' to 'de')
                const mappedLang = languageCodeMap[targetLang] || targetLang;
                
                // Process the CSV with the detected language
                processCSV(text, mappedLang);
            };
            reader.readAsText(file);
        });

        // Show content and hide placeholder
        document.getElementById('placeholderImage').style.display = 'none';
        document.getElementById('csvContents').style.display = 'block';
        
        // Enable buttons
        document.getElementById('previewButton').disabled = false;
        document.getElementById('saveButton').disabled = false;
    }

    // Modify the CSV processing function
    function processCSV(csv, targetLang) {
        const rows = csv.split('\n').map(row => row.split(','));
        const headers = rows[0];
        
        // Create table
        const table = document.createElement('table');
        table.className = 'translation-table';
        
        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        
        // Add key column header
        const keyHeader = document.createElement('th');
        keyHeader.textContent = 'Key';
        headerRow.appendChild(keyHeader);
        
        // Add language column headers
        headers.forEach((header, index) => {
            if (index > 0) { // Skip the first column as it's the key
                const th = document.createElement('th');
                th.textContent = header;
                // Store the target language as a data attribute
                th.dataset.lang = targetLang;
                headerRow.appendChild(th);
            }
        });
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Create table body
        const tbody = document.createElement('tbody');
        for (let i = 1; i < rows.length; i++) {
            if (rows[i].length <= 1) continue; // Skip empty rows
            
            const row = document.createElement('tr');
            const keyCell = document.createElement('td');
            keyCell.className = 'key-cell';
            keyCell.textContent = rows[i][0];
            row.appendChild(keyCell);
            
            // Add translation cells
            for (let j = 1; j < rows[i].length; j++) {
                const cell = document.createElement('td');
                cell.className = 'translation-cell';
                
                const container = document.createElement('div');
                container.className = 'translation-cell-container';
                
                const textarea = document.createElement('textarea');
                textarea.value = rows[i][j];
                textarea.dataset.originalValue = rows[i][j];
                textarea.dataset.original = rows[i][j];
                textarea.dataset.file = j - 1;
                textarea.dataset.key = rows[i][0];
                textarea.classList.add('unmodified');
                
                // Add translate button
                const translateButton = document.createElement('button');
                translateButton.className = 'cell-translate-button';
                translateButton.innerHTML = '🌐';
                translateButton.title = 'Translate';
                
                // Set up translation with the detected language
                translateButton.onclick = () => {
                    translateCell(translateButton, textarea, rows[i][0], targetLang);
                };
                
                container.appendChild(textarea);
                container.appendChild(translateButton);
                cell.appendChild(container);
                row.appendChild(cell);
            }
            
            tbody.appendChild(row);
        }
        
        table.appendChild(tbody);
        
        // Clear previous content and add new table
        const container = document.getElementById('csvContents');
        container.innerHTML = '';
        container.appendChild(table);
    }

    // Update the escapeHtml function to be more comprehensive
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Add window resize handler
    window.addEventListener('resize', () => {
        const files = document.getElementById('csvFileInput').files;
        if (files.length > 0) {
            const containerWidth = document.querySelector('.container').offsetWidth;
            const keyColumnWidth = 250;
            const availableWidth = containerWidth - keyColumnWidth;
            const optimalColumnWidth = Math.max(
                400,  // Increased from 300
                Math.min(800, availableWidth / files.length)  // Increased from 600
            );
            document.documentElement.style.setProperty('--column-width', `${optimalColumnWidth}px`);
        }
    });

    function calculateOptimalWidth(filesCount, preset) {
        const containerWidth = document.querySelector('.container').offsetWidth;
        const keyColumnWidth = 250;
        const availableWidth = containerWidth - keyColumnWidth;
        
        if (filesCount <= 2) {
            return Math.min(preset.max, Math.max(preset.min, availableWidth / filesCount));
        } else {
            return Math.max(preset.min, Math.min(preset.max, availableWidth / filesCount));
        }
    }

    function updateColumnWidths(preset) {
        const files = csvFileInput.files;
        if (files.length > 0) {
            const optimalWidth = calculateOptimalWidth(files.length, preset);
            
            // Update the CSS custom properties
            document.documentElement.style.setProperty('--column-width', `${optimalWidth}px`);
            
            // Update all translation cells and headers directly
            const translationCells = document.querySelectorAll('.translation-cell');
            const headerCells = document.querySelectorAll('.translation-table th:not(:first-child)');
            
            [...translationCells, ...headerCells].forEach(cell => {
                cell.style.width = `${optimalWidth}px`;
                cell.style.minWidth = `${preset.min}px`;
                cell.style.maxWidth = `${preset.max}px`;
            });
        }
    }

    // Update the column width selector handler
    columnWidthSelector.addEventListener('change', () => {
        const preset = widthPresets[columnWidthSelector.value];
        updateColumnWidths(preset);
    });

    // Update resize handler
    window.addEventListener('resize', () => {
        if (csvFileInput.files.length > 0) {
            const preset = widthPresets[columnWidthSelector.value];
            updateColumnWidths(preset);
        }
    });

    csvFileInput.addEventListener('change', (event) => {
        if (event.target.files.length === 0) {
            columnWidthSelector.disabled = true;
            columnWidthSelector.value = 'normal'; // Reset to default
        }
    });

    // Add new function to handle folder selection
    async function handleFolderSelect() {
        try {
            const dirHandle = await window.showDirectoryPicker();
            const files = [];
            
            // Iterate through directory entries
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.csv')) {
                    const file = await entry.getFile();
                    files.push(file);
                }
            }

            if (files.length === 0) {
                alert('No CSV files found in the selected folder.');
                return;
            }

            // Sort files alphabetically
            files.sort((a, b) => a.name.localeCompare(b.name));

            // Create a DataTransfer object to simulate file input
            const dataTransfer = new DataTransfer();
            files.forEach(file => dataTransfer.items.add(file));
            
            // Update the file input
            csvFileInput.files = dataTransfer.files;
            
            // Trigger the change event
            csvFileInput.dispatchEvent(new Event('change'));
            
            // Store the directory handle for saving
            window.selectedDirHandle = dirHandle;

        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Error selecting folder:', err);
                alert('Error selecting folder. Please try again.');
            }
        }
    }

    // Modify the file input wrapper to include folder selection
    const buttonGroup = document.querySelector('.button-group');
    const folderButton = document.createElement('button');
    folderButton.className = 'file-input-label';
    folderButton.textContent = 'Choose Folder';
    folderButton.onclick = handleFolderSelect;
    buttonGroup.appendChild(folderButton);
}); // Close the DOMContentLoaded event listener
