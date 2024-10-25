// Complete integration of previous fetch.js code into processPublications.js
import readline from 'readline';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { table } from 'console';

// Create an interface to read user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Global variable to store the vector (array of objects)
let authorIdsVector = [];

// Replace with your actual SerpAPI key
const serpApiKey = '9972e8b6f2847de4227cd23928352530839764d9b2f2249ea8a90aefdddaedb7';

// Utility function to ask a question using readline
function askQuestion(query) {
    return new Promise((resolve) => {
        rl.question(query, resolve);
    });
}

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
                    resolve(); // Resolve instead of closing readline here
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

// Function to create a delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to display publications in a selected format (tabular or JSON) with title length option
async function displayPublications(publications) {
    const format = (await askQuestion("Enter display format (table/json): ")).toLowerCase();
    const maxTitleLength = parseInt(await askQuestion("Enter the max characters for title (-1 for full title): "), 10);
    const publicationsToDisplay = publications.map(pub => {
        const truncatedTitle = maxTitleLength === -1 || !pub.title || pub.title.length <= maxTitleLength
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

// Function to interactively ask the user for filtering or sorting actions
async function filterAndSortLoop(publications) {
    let choice;
    do {
        choice = await askQuestion(`
Choose an action:
1. Sort by title (Ascending)
2. Sort by title (Descending)
3. Sort by year (Ascending)
4. Sort by year (Descending)
5. Sort by author (Ascending)
6. Sort by author (Descending)
7. Filter by title
8. Filter by year
9. Filter by author
10. Exit
Enter the number of your choice: `);

        switch (choice) {
            case '1':
                const sortedByTitleAsc = sortPublicationsByKey(publications, 'title', true);
                await displayPublications(sortedByTitleAsc);
                break;
            case '2':
                const sortedByTitleDesc = sortPublicationsByKey(publications, 'title', false);
                await displayPublications(sortedByTitleDesc);
                break;
            case '3':
                const sortedByYearAsc = sortPublicationsByKey(publications, 'year', true);
                await displayPublications(sortedByYearAsc);
                break;
            case '4':
                const sortedByYearDesc = sortPublicationsByKey(publications, 'year', false);
                await displayPublications(sortedByYearDesc);
                break;
            case '5':
                const sortedByAuthorAsc = sortPublicationsByKey(publications, 'authors', true);
                await displayPublications(sortedByAuthorAsc);
                break;
            case '6':
                const sortedByAuthorDesc = sortPublicationsByKey(publications, 'authors', false);
                await displayPublications(sortedByAuthorDesc);
                break;
            case '7':
                const titleFilter = await askQuestion('Enter title filter keyword: ');
                const filteredByTitle = filterPublicationsByKey(publications, 'title', titleFilter);
                await displayPublications(filteredByTitle);
                break;
            case '8':
                const yearFilter = await askQuestion('Enter year to filter by: ');
                const filteredByYear = filterPublicationsByKey(publications, 'year', yearFilter);
                await displayPublications(filteredByYear);
                break;
            case '9':
                const authorFilter = await askQuestion('Enter author name to filter by: ');
                const filteredByAuthor = filterPublicationsByKey(publications, 'authors', authorFilter);
                await displayPublications(filteredByAuthor);
                break;
            case '10':
                console.log('Exiting...');
                rl.close();
                break;
            default:
                console.log('Invalid choice, please try again.');
        }
    } while (choice !== '10');
}

// Function to sort publications by key (title, year, author)
function sortPublicationsByKey(publications, key, ascending = true) {
    return publications.sort((a, b) => {
        if (!a[key] || !b[key]) return 0; // If key is missing, do not change order

        if (ascending) {
            return a[key].toString().localeCompare(b[key].toString(), undefined, { numeric: true });
        } else {
            return b[key].toString().localeCompare(a[key].toString(), undefined, { numeric: true });
        }
    });
}

// Function to filter publications by key (title, year, author) and filter value
function filterPublicationsByKey(publications, key, value) {
    return publications.filter(pub => {
        if (!pub[key]) return false; // Skip publications without the key
        return pub[key].toString().toLowerCase().includes(value.toLowerCase());
    });
}

// Sample main function to demonstrate processing
async function main() {
    try {
        console.log("Starting main function..."); // Debug: Check if main function starts

        // Wait for user input to initialize authors vector
        await initializeAuthorIdsVector();

        // Fetch all publications once and store them
        let allPublications = [];
        for (const author of authorIdsVector) {
            const { dblpAuthorId } = author;
            // Fetch DBLP data using PID if available
            const dblpPublications = await fetchPublications(dblpAuthorId);
            if (dblpPublications !== null) {
                allPublications.push(...dblpPublications);
            }
            await delay(2000); // Add delay to avoid rate-limiting issues
        }

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
