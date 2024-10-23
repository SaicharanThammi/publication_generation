# README.md

## Summary Report of Author Publications

The main goal of this task was to generate, sort, and filter the publications of an author using Google Scholar and DBLP IDs. A node script was used to interactively prompt users to input the author information and manage the publication data.

### Author IDs Vector
- **Google Scholar ID**: iHigKrEAAAAJ
- **DBLP Author ID**: 58/1076-1

The publications were obtained from the author’s profiles in both Google Scholar and DBLP. The generated list of publications included various attributes such as title, year, journal, book title, page range, URL, and type.

### Publications Overview
A total of 16 publications were generated, ranging from 2008 to 2023, across different types such as journal articles and conference proceedings. The titles were truncated based on the user input, limiting to a maximum of 5 characters. The data was first displayed in a tabular format and later sorted in different ways to give more insight into the publication data.

### Operations Implemented
1. **Initial Display**: The publications were first shown with the titles limited to 5 characters for easier viewing.
2. **Sorting**: The publications were sorted alphabetically by title (A-Z) and also by year in ascending order.
3. **Filtering**: Several filters were implemented to enhance data exploration:
   - **Filter by Type**: Users can filter publications by type, such as 'article' or 'inproceedings'.
   - **Filter by Year Range**: Users can specify a start and end year to filter publications within a specific range. This helps to focus on publications during a particular period.
4. **Display Format Change**: Users were given the option to change the display format between table and JSON. JSON format was particularly useful for exporting the publication list for further data manipulation.

### Key Findings
- **Recent Publications**: The most recent publication is from 2023, titled "A Survey on..." in *Comput. Networks*.
- **Publication Trends**: There is a consistent publishing record from 2008 onwards, with peak productivity in the year 2014.
- **Type Distribution**: Publications were categorized as either 'articles' or 'inproceedings'. Notably, several papers were presented at conferences such as VLSI-SoC, NOCS, and IEEE Access.

### Display and Sorting Challenges
- During the interactive session, some issues were encountered with handling user input correctly, leading to a type error when determining the display format.
- The max characters for the title input helped ensure readability, especially when viewing the publications in tabular format.

### Conclusion
The implementation effectively gathered and processed the author's publication data, allowing various user interactions for sorting and filtering. The sorting and filtering functions provided useful insights, such as identifying high-impact conferences and observing year-wise publication trends.

For future improvements, handling interactive inputs more robustly and enabling more advanced filtering options could enhance user experience.

