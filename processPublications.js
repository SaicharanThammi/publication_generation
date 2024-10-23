// Complete integration with fetch.js code, combined into processPublications.js
import readline from 'readline';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { table } from 'console';

// Create a readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Global variable to store the vector (array of objects)
let authorIdsVector = [];

// Replace with your actual SerpAPI key
const serpApiKey = '9972e8b6f2847de4227cd23928352530839764d9b2f2249ea8a90aefdddaedb7';

// Function to populate the vector with user input
async function initializeAuthorIdsVector() {
    const size = await askQuestion("Enter the size of the vector: ");
    const vectorSize = parseInt(size);
    if (isNaN(vectorSize) || vectorSize <= 0) {
        console.log("Invalid size. Exiting...");
        rl.close();
        throw new Error("Invalid size");
    }
    for (let count = 0; count < vectorSize; count++) {
        const googleScholarId = await askQuestion(`Enter Google Scholar ID for author ${count + 1} (leave blank if not available): `);
        const dblpAuthorId = await askQuestion(`Enter DBLP author ID (PID) for author ${count + 1} (leave blank if not available): `);
        if (!googleScholarId && !dblpAuthorId) {
            console.log("At least one ID must be provided. Please try again.");
            count--; // Retry current index
            continue;
        }
        authorIdsVector.push({
            googleScholarId: googleScholarId || null,
            dblpAuthorId: dblpAuthorId || null
        });
    }
    console.log("Author IDs Vector:", authorIdsVector);
}

// Utility function to ask a question using readline
function askQuestion(query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
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

        // Handle page range and total number of pages
        let pageRange = publicationType.pages || null;
        let numPages = null;
        if (pageRange && pageRange.includes('-')) {
            const [start, end] = pageRange.split('-').map(Number);
            numPages = end - start + 1;
        }

        return {
            title: publicationType.title || "No Title",
            year: publicationType.year || "No Year",
            journal: publicationType.journal || null,
            booktitle: publicationType.booktitle || null,
            pageRange: pageRange,
            numPages: numPages,
            url: url,
            type: type,
        };
    });
}

// Function to fetch data for all authors in the vector (fetches once and then processes data)
async function fetchAllAuthorDetails() {
    const allPublications = [];
    for (const author of authorIdsVector) {
        const { dblpAuthorId } = author;
        // Fetch DBLP data using PID if available
        const dblpPublications = await fetchPublications(dblpAuthorId);
        if (dblpPublications !== null) {
            allPublications.push(...dblpPublications);
        }
    }
    return allPublications;
}

// Function to display publications in a selected format (tabular or JSON) with title length option
async function displayPublications(publications) {
    const format = (await askQuestion("Enter display format (table/json): ")).toLowerCase();
    const maxTitleLength = parseInt(await askQuestion("Enter the max characters for title (-1 for full title): "), 10);
    const publicationsToDisplay = publications.map(pub => {
        const truncatedTitle = maxTitleLength === -1 || pub.title.length <= maxTitleLength
            ? pub.title
            : pub.title.substring(0, maxTitleLength) + '...';
        return {
            ...pub,
            title: truncatedTitle
        };
    });

    if (format === 'json') {
        console.log(JSON.stringify(publicationsToDisplay, null, 2));
    } else {
        console.table(publicationsToDisplay);
    }
}

// Function to sort publications by title
function sortPublicationsByTitle(publications, ascending = true) {
    return publications.sort((a, b) => ascending ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title));
}

// Function to sort publications by year
function sortPublicationsByYear(publications, ascending = true) {
    return publications.sort((a, b) => ascending ? parseInt(a.year) - parseInt(b.year) : parseInt(b.year) - parseInt(a.year));
}

// Function to filter publications by type
function filterPublicationsByType(publications, type) {
    return publications.filter(pub => pub.type === type);
}

// Function to filter publications by year or range of years
function filterPublicationsByYearRange(publications, startYear, endYear) {
    return publications.filter(pub => {
        const year = parseInt(pub.year, 10);
        return year >= startYear && year <= endYear;
    });
}

// Function to interactively ask the user for filtering or sorting actions
async function filterAndSortLoop(publications) {
    let choice;
    do {
        choice = await askQuestion(`
Choose an action:
1. Sort by title (A-Z)
2. Sort by title (Z-A)
3. Sort by year (Ascending)
4. Sort by year (Descending)
5. Filter by type (e.g., 'article')
6. Filter by year range
7. Exit
Enter the number of your choice: `);
        switch (choice) {
            case '1':
                const sortedByTitleAsc = sortPublicationsByTitle(publications, true);
                await displayPublications(sortedByTitleAsc);
                break;
            case '2':
                const sortedByTitleDesc = sortPublicationsByTitle(publications, false);
                await displayPublications(sortedByTitleDesc);
                break;
            case '3':
                const sortedByYearAsc = sortPublicationsByYear(publications, true);
                await displayPublications(sortedByYearAsc);
                break;
            case '4':
                const sortedByYearDesc = sortPublicationsByYear(publications, false);
                await displayPublications(sortedByYearDesc);
                break;
            case '5':
                const type = await askQuestion('Enter the type to filter by (e.g., "article"): ');
                const filteredByType = filterPublicationsByType(publications, type);
                await displayPublications(filteredByType);
                break;
            case '6':
                const startYear = parseInt(await askQuestion('Enter start year: '), 10);
                const endYear = parseInt(await askQuestion('Enter end year: '), 10);
                const filteredByYearRange = filterPublicationsByYearRange(publications, startYear, endYear);
                await displayPublications(filteredByYearRange);
                break;
            case '7':
                console.log('Exiting...');
                rl.close();
                break;
            default:
                console.log('Invalid choice, please try again.');
        }
    } while (choice !== '7');
}

// Sample main function to demonstrate processing
async function main() {
    try {
        console.log("Starting main function..."); // Debug: Check if main function starts

        // Wait for user input to initialize authors vector
        await initializeAuthorIdsVector();

        // Fetch all publications once and store them
        const allPublications = await fetchAllAuthorDetails();
        console.log("All Publications:");
        await displayPublications(allPublications);

        // Start the filtering and sorting loop
        await filterAndSortLoop(allPublications);

    } catch (error) {
        console.error('Error:', error);
        rl.close();
    }
}

// Run the main function
main().catch(console.error);
