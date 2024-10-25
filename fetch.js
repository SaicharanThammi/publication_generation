import readline from 'readline';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

// Create an interface to read user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Global variable to store the vector (array of objects)
let authorIdsVector = [];

// Replace with your actual SerpAPI key
const serpApiKey = '9972e8b6f2847de4227cd23928352530839764d9b2f2249ea8a90aefdddaedb7';

// Function to populate the vector with user input
function initializeAuthorIdsVector() {
    return new Promise((resolve, reject) => {
        rl.question("Enter the size of the vector: ", (size) => {
            size = parseInt(size);
            if (isNaN(size) || size <= 0) {
                console.log("Invalid size. Exiting...");
                rl.close();
                reject("Invalid size");
                return;
            }

            let count = 0;
            function askForIds() {
                if (count < size) {
                    rl.question(`Enter Google Scholar ID for author ${count + 1} (leave blank if not available): `, (googleScholarId) => {
                        rl.question(`Enter DBLP author ID (PID) for author ${count + 1} (leave blank if not available): `, (dblpAuthorId) => {
                            // Store the input in the vector only if at least one ID is provided
                            if (!googleScholarId && !dblpAuthorId) {
                                console.log("At least one ID must be provided. Please try again.");
                                return askForIds(); // Ask again for valid IDs
                            }

                            authorIdsVector.push({
                                googleScholarId: googleScholarId || null,
                                dblpAuthorId: dblpAuthorId || null
                            });
                            count++;
                            askForIds(); // Continue asking for the next author
                        });
                    });
                } else {
                    console.log("Author IDs Vector:", authorIdsVector);
                    rl.close(); // Close the readline interface when done
                    resolve();
                }
            }

            askForIds(); // Start the loop
        });
    });
}

// Function to fetch publications from DBLP using PID
async function fetchPublications(dblpAuthorId) {
    if (!dblpAuthorId) {
        console.warn('No DBLP Author ID provided. Skipping publication fetch.');
        return null;
    }

    const url = `https://dblp.org/pid/${dblpAuthorId}.xml`; // URL for the PID
    try {
        const response = await axios.get(url);
        const xml = response.data;
        const json = await parseStringPromise(xml, { explicitArray: false });
        return extractPublications(json.dblpperson, dblpAuthorId); // Pass the dblpperson object
    } catch (error) {
        console.error('Error fetching publications:', error);
        return null;
    }
}

// Function to extract only the person's publications
function extractPublications(data, pid) {
    const publications = data.r; // Accessing the publications
    const articles = Array.isArray(publications) ? publications : publications ? [publications] : [];

    // Filter publications where the specified PID is one of the authors
    const myPublications = articles.filter(pub => {
        const authors = [
            ...(Array.isArray(pub.article?.author) ? pub.article.author : [pub.article?.author]),
            ...(Array.isArray(pub.inproceedings?.author) ? pub.inproceedings.author : [pub.inproceedings?.author])
        ].filter(Boolean); // Combine and filter out nulls

        return authors.some(author => author.$?.pid === pid); // Check by PID
    });

    // Map to a simpler object
    return myPublications.map(pub => {
        const publicationType = pub.article || pub.inproceedings;
        const type = pub.article ? 'article' : 'inproceedings'; // Determine type

        // Handle different URL formats
        let url;
        if (typeof publicationType.ee === 'string') {
            url = publicationType.ee;
        } else if (typeof publicationType.ee === 'object' && !Array.isArray(publicationType.ee)) {
            url = publicationType.ee._ || publicationType.ee; // Extract value if it's a dictionary
        } else if (Array.isArray(publicationType.ee)) {
            url = publicationType.ee; // Keep the array of URLs as is
        } else {
            url = publicationType.url || null;
        }

        return {
            title: publicationType.title || "No Title",
            year: publicationType.year || "No Year",
            journal: publicationType.journal || null,
            booktitle: publicationType.booktitle || null,
            pages: publicationType.pages || null,
            url: url,
            type: type,
        };
    });
}

// Function to fetch data from Google Scholar via SerpAPI
async function fetchGoogleScholarData(googleScholarId) {
    if (!googleScholarId) {
        console.warn('No Google Scholar ID provided. Skipping Google Scholar data fetch.');
        return null;
    }

    try {
        const url = 'https://serpapi.com/search.json';
        const params = {
            engine: 'google_scholar_author',
            author_id: googleScholarId,
            api_key: serpApiKey
        };
        
        const response = await axios.get(url, { params });
        const data = response.data;
        return data;
    } catch (error) {
        console.error(`Error fetching Google Scholar data for ${googleScholarId}:`, 
                      error.response ? error.response.data : error.message);
        return null;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// function to merge dblp and google scholars publications
function mergePublicationsCommonFields(dblpPublications, googleScholarData) {
    // Handle null or undefined inputs
    const dblpPubs = dblpPublications || [];
    const googlePubs = googleScholarData?.articles || [];
    
    // Function to normalize titles for comparison
    const normalizeTitle = (title) => {
        return title.toLowerCase()
            .replace(/[^\w\s]/g, '')  // Remove punctuation
            .replace(/\s+/g, ' ')     // Normalize whitespace
            .trim();
    };

    // Function to get all URLs from a publication entry
    const getUrls = (urlField) => {
        if (!urlField) return [];
        if (typeof urlField === 'string') return [urlField];
        if (Array.isArray(urlField)) return urlField.filter(url => url);
        return [];
    };

    // Create a map to store merged publications
    const mergedPublicationsMap = new Map();
    
    // Process DBLP publications
    dblpPubs.forEach(pub => {
        const normalizedTitle = normalizeTitle(pub.title);
        
        mergedPublicationsMap.set(normalizedTitle, {
            title: pub.title,
            year: parseInt(pub.year) || null,
            venue: pub.journal || pub.booktitle || '',
            authors: [], // Will be filled from Google Scholar
            urls: getUrls(pub.url)
        });
    });
    
    // Process and merge Google Scholar publications
    googlePubs.forEach(pub => {
        const normalizedTitle = normalizeTitle(pub.title);
        const existingPub = mergedPublicationsMap.get(normalizedTitle);
        
        if (existingPub) {
            // Update existing publication with Google Scholar data
            if (pub.authors?.length > 0) {
                existingPub.authors = pub.authors;
            }
            if (pub.year) {
                existingPub.year = parseInt(pub.year) || existingPub.year;
            }
            if (pub.publication) {
                existingPub.venue = existingPub.venue || pub.publication;
            }
            
            // Combine URLs from both sources and remove duplicates
            const newUrls = getUrls(pub.link);
            existingPub.urls = [...new Set([...existingPub.urls, ...newUrls])];
        } else {
            // Create new entry for Google Scholar publication
            mergedPublicationsMap.set(normalizedTitle, {
                title: pub.title,
                year: parseInt(pub.year) || null,
                venue: pub.publication || '',
                authors: pub.authors || [],
                urls: getUrls(pub.link)
            });
        }
    });
    
    // Convert map to array and sort by year
    return Array.from(mergedPublicationsMap.values())
        .sort((a, b) => (b.year || 0) - (a.year || 0));
}

async function fetchAuthorDetails() {
    for (const author of authorIdsVector) {
        const { googleScholarId, dblpAuthorId } = author;
        
        const dblpPublications = await fetchPublications(dblpAuthorId);
        const googleScholarData = await fetchGoogleScholarData(googleScholarId);
        
        const mergedPublications = mergePublicationsCommonFields(
            dblpPublications, 
            googleScholarData
        );
        
        console.log('Merged Publications:', mergedPublications);
        
        await delay(1000);
    }
}


// Main function to control the flow
async function main() {
    try {
        await initializeAuthorIdsVector();  // Wait for user input to finish
        await fetchAuthorDetails();  // Fetch details after input is collected
    } catch (error) {
        console.log("Error:", error);
    }
}

// Start the process
main();