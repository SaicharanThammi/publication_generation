// script.js
import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

// Parse command-line arguments using yargs
const argv = yargs(hideBin(process.argv))
    .option('google-scholar-id', {
        alias: 'g',
        describe: 'Google Scholar ID of the author',
        type: 'string',
        demandOption: true
    })
    .option('dblp-author-id', {
        alias: 'd',
        describe: 'DBLP Author ID (PID)',
        type: 'string',
        demandOption: true
    })
    .option('sort-by', {
        alias: 's',
        describe: 'Sort publications by title, year, or venue',
        choices: ['title', 'year', 'venue'],
        default: 'year'
    })
    .option('order', {
        alias: 'o',
        describe: 'Order of sorting: asc or desc',
        choices: ['asc', 'desc'],
        default: 'desc'
    })
    .option('search', {
        alias: 'q',
        describe: 'Search term to filter publications by title, venue, or year',
        type: 'string'
    })
    .help()
    .argv;

// Function to fetch publications from DBLP using PID
async function fetchPublications(dblpAuthorId) {
    if (!dblpAuthorId) {
        console.warn('No DBLP Author ID provided. Skipping publication fetch.');
        return null;
    }

    const url = `https://dblp.org/pid/${dblpAuthorId}.xml`;
    try {
        const response = await axios.get(url);
        const xml = response.data;
        const json = await parseStringPromise(xml, { explicitArray: false });
        return extractPublications(json.dblpperson, dblpAuthorId);
    } catch (error) {
        console.error('Error fetching publications:', error);
        return null;
    }
}

// Function to extract publications
function extractPublications(data, pid) {
    const publications = data.r;
    const articles = Array.isArray(publications) ? publications : publications ? [publications] : [];

    return articles.map(pub => {
        const publicationType = pub.article || pub.inproceedings;
        const type = pub.article ? 'article' : 'inproceedings';

        let url = null;
        if (publicationType && publicationType.ee) {
            if (typeof publicationType.ee === 'string') {
                url = publicationType.ee;
            } else if (typeof publicationType.ee === 'object' && !Array.isArray(publicationType.ee)) {
                url = publicationType.ee._ || publicationType.ee;
            } else if (Array.isArray(publicationType.ee)) {
                url = publicationType.ee[0];
            }
        }

        return {
            title: publicationType?.title || "No Title",
            year: publicationType?.year || "No Year",
            venue: publicationType?.journal || publicationType?.booktitle || null,
            type: type,
            url: url,
        };
    });
}

// Mock function to simulate fetching Google Scholar data
async function fetchGoogleScholarData(googleScholarId) {
    if (!googleScholarId) {
        console.warn('No Google Scholar ID provided. Skipping Google Scholar data fetch.');
        return null;
    }

    // Mock data for demonstration purposes
    const mockData = {
        googleScholarId: googleScholarId,
        publications: [
            {
                title: 'A Survey on Role of Blockchain for IoT: Applications and Technical Aspects.',
                year: 2023,
                venue: 'Comput. Networks',
                authors: ['S Mathur', 'A Kalla', 'G Gür', 'MK Bohra', 'M Liyanage'],
                urls: [
                    'https://doi.org/10.1016/j.comnet.2023.109726',
                    'https://www.wikidata.org/entity/Q120999026',
                    'https://scholar.google.com/citations?view_op=view_citation&hl=en&user=iHigKrEAAAAJ&citation_for_view=iHigKrEAAAAJ:Zph67rFs4hoC'
                ]
            }
        ]
    };

    return mockData.publications;
}

// Function to merge and sort publications
function mergePublications(dblpPublications, googleScholarPublications, search, sortBy, order) {
    const merged = [];

    if (dblpPublications) {
        merged.push(...dblpPublications);
    }
    if (googleScholarPublications) {
        merged.push(...googleScholarPublications);
    }

    const filteredPublications = search ? searchPublications(merged, search) : merged;

    return sortPublications(filteredPublications, sortBy, order);
}

// Search publications based on a term
function searchPublications(publications, searchTerm) {
    const term = searchTerm.toLowerCase();
    return publications.filter(pub =>
        (pub.title && pub.title.toLowerCase().includes(term)) ||
        (pub.venue && pub.venue.toLowerCase().includes(term)) ||
        (pub.year && pub.year.toString().includes(term))
    );
}

// Sort publications based on criteria
function sortPublications(publications, sortBy, order) {
    const sorted = publications.slice();
    sorted.sort((a, b) => {
        let compareA = a[sortBy] || '';
        let compareB = b[sortBy] || '';

        if (sortBy === 'year') {
            compareA = parseInt(compareA) || 0;
            compareB = parseInt(compareB) || 0;
        } else {
            compareA = compareA.toString().toLowerCase();
            compareB = compareB.toString().toLowerCase();
        }

        if (order === 'asc') {
            return compareA < compareB ? -1 : compareA > compareB ? 1 : 0;
        } else {
            return compareA > compareB ? -1 : compareA < compareB ? 1 : 0;
        }
    });
    return sorted;
}

// Display the publications
function displayPublications(publications) {
    if (!publications || publications.length === 0) {
        console.error('No publications data found.');
        return;
    }

    publications.forEach((pub, index) => {
        console.log(`Publication ${index + 1}:`);
        console.log(`  Title: ${pub.title}`);
        console.log(`  Year: ${pub.year}`);
        console.log(`  Venue: ${pub.venue}`);
        console.log(`  URLs: ${pub.url || 'N/A'}`);
        console.log('-------------------------------------------');
    });
}

// Main function to control the flow
async function main() {
    try {
        const googleScholarId = argv['google-scholar-id'];
        const dblpAuthorId = argv['dblp-author-id'];

        const dblpPublications = await fetchPublications(dblpAuthorId);
        const googleScholarPublications = await fetchGoogleScholarData(googleScholarId);

        const mergedPublications = mergePublications(
            dblpPublications,
            googleScholarPublications,
            argv.search,
            argv['sort-by'],
            argv.order
        );

        displayPublications(mergedPublications);
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Start the process
main();
