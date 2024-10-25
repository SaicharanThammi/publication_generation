import readline from 'readline';
import axios from 'axios';
import { parseStringPromise } from 'xml2js';

const serpApiKey = '9972e8b6f2847de4227cd23928352530839764d9b2f2249ea8a90aefdddaedb7';
let mergedPublicationsData = [];

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(prompt) {
    return new Promise((resolve) => rl.question(prompt, resolve));
}

async function initializeAuthorIdsVector() {
    const size = parseInt(await question("Enter the size of the vector: "));
    if (isNaN(size) || size <= 0) {
        console.log("Invalid size. Exiting...");
        return null;
    }

    const authorIdsVector = [];
    for (let i = 0; i < size; i++) {
        const googleScholarId = await question(`Enter Google Scholar ID for author ${i + 1} (leave blank if not available): `);
        const dblpAuthorId = await question(`Enter DBLP author ID (PID) for author ${i + 1} (leave blank if not available): `);

        if (!googleScholarId && !dblpAuthorId) {
            console.log("At least one ID must be provided. Please try again.");
            i--;
            continue;
        }

        authorIdsVector.push({
            googleScholarId: googleScholarId || null,
            dblpAuthorId: dblpAuthorId || null
        });
    }

    console.log("Author IDs Vector:", authorIdsVector);
    return authorIdsVector;
}

function extractPublications(data, pid) {
    if (!data || !data.r) return [];

    const publications = data.r;
    const articles = Array.isArray(publications) ? publications : publications ? [publications] : [];

    const myPublications = articles.filter(pub => {
        const authors = [
            ...(Array.isArray(pub.article?.author) ? pub.article.author : [pub.article?.author]),
            ...(Array.isArray(pub.inproceedings?.author) ? pub.inproceedings.author : [pub.inproceedings?.author])
        ].filter(Boolean);

        return authors.some(author => author.$?.pid === pid);
    });

    return myPublications.map(pub => {
        const publicationType = pub.article || pub.inproceedings;
        const type = pub.article ? 'article' : 'inproceedings';

        let url;
        if (typeof publicationType.ee === 'string') {
            url = publicationType.ee;
        } else if (typeof publicationType.ee === 'object' && !Array.isArray(publicationType.ee)) {
            url = publicationType.ee._ || publicationType.ee;
        } else if (Array.isArray(publicationType.ee)) {
            url = publicationType.ee[0];
        } else {
            url = publicationType.url || null;
        }

        return {
            title: publicationType.title || "No Title",
            year: publicationType.year || null,
            journal: publicationType.journal || null,
            booktitle: publicationType.booktitle || null,
            pages: publicationType.pages || null,
            url: url,
            type: type,
        };
    });
}

async function fetchPublications(dblpAuthorId) {
    if (!dblpAuthorId) {
        console.warn('No DBLP Author ID provided. Skipping publication fetch.');
        return null;
    }

    try {
        const response = await axios.get(`https://dblp.org/pid/${dblpAuthorId}.xml`);
        const json = await parseStringPromise(response.data, { explicitArray: false });
        return extractPublications(json.dblpperson, dblpAuthorId);
    } catch (error) {
        console.error('Error fetching publications:', error);
        return null;
    }
}

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
        return response.data;
    } catch (error) {
        console.error(`Error fetching Google Scholar data:`, error.message);
        return null;
    }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function mergePublicationsCommonFields(dblpPublications, googleScholarData) {
    const dblpPubs = dblpPublications || [];
    const googlePubs = googleScholarData?.articles || [];

    const normalizeTitle = (title) => {
        return title.toLowerCase()
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const getUrls = (urlField) => {
        if (!urlField) return [];
        if (typeof urlField === 'string') return [urlField];
        if (Array.isArray(urlField)) return urlField.filter(url => url);
        return [];
    };

    const mergedPublicationsMap = new Map();

    dblpPubs.forEach(pub => {
        const normalizedTitle = normalizeTitle(pub.title);
        mergedPublicationsMap.set(normalizedTitle, {
            title: pub.title,
            year: parseInt(pub.year) || null,
            venue: pub.journal || pub.booktitle || '',
            authors: [],
            urls: getUrls(pub.url)
        });
    });

    googlePubs.forEach(pub => {
        const normalizedTitle = normalizeTitle(pub.title);
        const existingPub = mergedPublicationsMap.get(normalizedTitle);

        if (existingPub) {
            if (pub.authors?.length > 0) {
                existingPub.authors = pub.authors;
            }
            if (pub.year) {
                existingPub.year = parseInt(pub.year) || existingPub.year;
            }
            if (pub.publication) {
                existingPub.venue = existingPub.venue || pub.publication;
            }
            const newUrls = getUrls(pub.link);
            existingPub.urls = [...new Set([...existingPub.urls, ...newUrls])];
        } else {
            mergedPublicationsMap.set(normalizedTitle, {
                title: pub.title,
                year: parseInt(pub.year) || null,
                venue: pub.publication || '',
                authors: pub.authors || [],
                urls: getUrls(pub.link)
            });
        }
    });

    return Array.from(mergedPublicationsMap.values())
        .sort((a, b) => (b.year || 0) - (a.year || 0));
}

async function processPublications() {
    try {
        const authorIdsVector = await initializeAuthorIdsVector();
        if (!authorIdsVector) return false;

        for (const author of authorIdsVector) {
            const { googleScholarId, dblpAuthorId } = author;
            const dblpPublications = await fetchPublications(dblpAuthorId);
            const googleScholarData = await fetchGoogleScholarData(googleScholarId);

            mergedPublicationsData = mergePublicationsCommonFields(
                dblpPublications,
                googleScholarData
            );

            console.log('Merged Publications:', mergedPublicationsData);
            await delay(1000);
        }
        return true;
    } catch (error) {
        console.error("Error processing publications:", error);
        return false;
    }
}

function sortPublicationsByTitle(ascending = true) {
    return [...mergedPublicationsData].sort((a, b) => 
        ascending ? a.title.localeCompare(b.title) : b.title.localeCompare(a.title)
    );
}

function sortPublicationsByYear(ascending = true) {
    return [...mergedPublicationsData].sort((a, b) => 
        ascending ? (a.year || 0) - (b.year || 0) : (b.year || 0) - (a.year || 0)
    );
}

function sortPublicationsByVenue(ascending = true) {
    return [...mergedPublicationsData].sort((a, b) => 
        ascending ? (a.venue || '').localeCompare(b.venue || '') : (b.venue || '').localeCompare(a.venue || '')
    );
}

function searchInTitle(keyword) {
    return mergedPublicationsData.filter(pub => 
        pub.title.toLowerCase().includes(keyword.toLowerCase())
    );
}

function searchInYear(year) {
    return mergedPublicationsData.filter(pub => pub.year === parseInt(year));
}

function searchInVenue(keyword) {
    return mergedPublicationsData.filter(pub => 
        (pub.venue || '').toLowerCase().includes(keyword.toLowerCase())
    );
}

async function handleUserChoice() {
    while (true) {
        console.log("\nSelect an option:");
        console.log("1. Sort by title (ascending)");
        console.log("2. Sort by title (descending)");
        console.log("3. Sort by year (ascending)");
        console.log("4. Sort by year (descending)");
        console.log("5. Sort by venue (ascending)");
        console.log("6. Sort by venue (descending)");
        console.log("7. Search in title");
        console.log("8. Search in year");
        console.log("9. Search in venue");
        console.log("0. Exit");

        const choice = await question("Enter your choice: ");

        switch (parseInt(choice)) {
            case 1:
                console.log(sortPublicationsByTitle(true));
                break;
            case 2:
                console.log(sortPublicationsByTitle(false));
                break;
            case 3:
                console.log(sortPublicationsByYear(true));
                break;
            case 4:
                console.log(sortPublicationsByYear(false));
                break;
            case 5:
                console.log(sortPublicationsByVenue(true));
                break;
            case 6:
                console.log(sortPublicationsByVenue(false));
                break;
            case 7: {
                const keyword = await question("Enter keyword to search in title: ");
                console.log(searchInTitle(keyword));
                break;
            }
            case 8: {
                const year = await question("Enter year to search: ");
                console.log(searchInYear(year));
                break;
            }
            case 9: {
                const keyword = await question("Enter keyword to search in venue: ");
                console.log(searchInVenue(keyword));
                break;
            }
            case 0:
                return;
            default:
                console.log("Invalid choice. Please try again.");
        }
    }
}

async function main() {
    try {
        const success = await processPublications();
        if (success) {
            await handleUserChoice();
        }
    } catch (error) {
        console.error("Error:", error);
    } finally {
        rl.close();
    }
}

main();