# **Programmatic Extraction of Data Model Metadata from Power BI and Tableau: An Exhaustive Technical Analysis**

## **Introduction to the Enterprise Metadata Ecosystem**

As organizations continuously mature their data engineering and analytics capabilities, the imperative to manage, govern, and audit the metadata embedded within Business Intelligence (BI) platforms becomes increasingly critical. The modern enterprise relies heavily on advanced analytical platforms, most notably Microsoft Power BI and Salesforce Tableau, to abstract complex data engineering pipelines into accessible, high-performance visual interfaces. However, as these deployments scale across thousands of reports and petabytes of underlying data, the proprietary, often opaque nature of the file formats utilized by these platforms presents a significant engineering bottleneck. The ability to programmatically extract detailed data model metadata—specifically encompassing table structures, column definitions, data types, cross-table relationships, calculated fields, and advanced analytical expressions—is an absolute necessity for continuous integration, automated auditing, data lineage tracking, and cross-platform interoperability.

This comprehensive research report provides an exhaustive architectural and programmatic analysis of Power BI and Tableau file formats. It investigates their internal topographies, the underlying schemas governing their semantic data models, and the programmatic methodologies required to successfully parse them using Node.js and TypeScript. Furthermore, this analysis delineates the boundaries of minimum viable extraction, the severe technical limitations imposed by proprietary compression algorithms, and the intricate legal considerations surrounding the reverse engineering of these analytical artifacts. By exploring the evolution from legacy monolithic file structures to modern, declarative text-based architectures, this report serves as a definitive guide for engineering teams tasked with bridging the gap between proprietary BI ecosystems and automated data governance solutions.

## **Architectural Analysis of Power BI File Formats**

Microsoft Power BI encapsulates its semantic models, visualization definitions, connection strings, and underlying data within specific file extensions. Understanding the dichotomy between the primary binary format and its template counterpart is foundational to implementing programmatic extraction pipelines.

### **Open Packaging Conventions and Internal Topography**

At a structural level, both the .pbix (Power BI Desktop Document) and .pbit (Power BI Template) file formats strictly adhere to the Open Packaging Conventions (OPC) standard.1 This standard, which is analogous to the architecture utilized by modern Microsoft Office files such as .docx or .xlsx, dictates that the file is fundamentally a ZIP archive.1 This archive contains a structured, hierarchical arrangement of XML files, binary blobs, and metadata manifests that together constitute the Power BI report and its underlying data model.1

By programmatic intervention—specifically by renaming a .pbix or .pbit file extension to .zip and subsequently decompressing it—the internal file topography is exposed to the developer.1 Traversing this unzipped directory reveals several critical components required for the report to function correctly. The most pivotal of these is the .xml file. This XML document serves as the root manifest for the entire package, mapping every internal file and directory to its specific MIME type or content definition.1 Without this precise mapping, parsing engines and the Power BI Desktop application itself cannot correctly interpret the package structure, leading to immediate corruption errors if the file is improperly repackaged.1

Beyond the manifest, the directory contains a Settings file, which houses versioning details and environment configuration metadata, and a SecurityBindings file, which contains the exact definitions for Row-Level Security (RLS) applied to the dataset.4 The visual layer of the report is defined within the Report/Layout file. This specific file is a highly nested, complex JSON document that dictates the visual canvas, chart configurations, UI layer components, and the spatial arrangement of visuals on the report pages.2 While the Layout file is essential for understanding the presentation layer, the core objective of data model extraction requires targeting the semantic engine itself. This semantic engine is localized within a file named DataModel (in the case of a .pbix archive) or DataModelSchema (in the case of a .pbit archive).2

### **The Dichotomy of.pbix and.pbit Formats**

The critical divergence between a .pbix file and a .pbit file lies entirely in data instantiation and their respective compression states. This distinction fundamentally alters the programmatic approach required for metadata extraction.

A .pbix file is a comprehensive snapshot. It contains the actual imported data from the source systems, heavily compressed and stored in-memory using the Analysis Services VertiPaq compression engine.2 Because this engine is optimized for blazing-fast query performance over massive datasets, the data model and the data itself are fused into a proprietary, highly optimized binary file named DataModel.2

Conversely, a .pbit file acts exclusively as a structural template.6 It retains the exact same reporting layer, relational architecture, Data Analysis Expressions (DAX) formulas, and Power Query (M) scripts, but it deliberately strips out the underlying data rows.6 This is typically done to minimize file size for sharing or to enforce data governance by requiring users to refresh the data upon opening the template. Because the physical data is absent, the VertiPaq engine does not need to compress the model into a binary blob. Instead, the model's metadata is serialized gracefully as plain text in a file explicitly named DataModelSchema.6

### **The MS-Xpress9 Compression Barrier**

Extracting metadata directly from the DataModel binary file within a .pbix archive presents a formidable cryptographic and algorithmic challenge for Node.js developers. The DataModel file is not inherently encrypted (unless explicitly protected via Microsoft Information Protection enterprise labels), but it is aggressively compressed using Microsoft's proprietary Xpress9 algorithm, commonly referred to in technical documentation as MS-XCA.8

The MS-Xpress9 algorithm utilizes an advanced combination of LZ77 dictionary compression layered with Huffman encoding, optimized specifically for fast memory-to-disk dumping in analytical workloads.12 While the theoretical decompression algorithm is publicly documented within Microsoft's open specifications protocol 12, implementing a native, performant Node.js decoder is exceptionally difficult and practically non-existent in the open-source community.14 Existing Node.js decompression libraries—such as zlib, pako, decompress-zip, and compressing—are designed to handle standard DEFLATE, GZIP, and Brotli algorithms.16 They cannot natively interpret the Xpress9 binary streams.17 Attempting to parse the DataModel binary directly in JavaScript without a dedicated Xpress9 C++ binding or a WebAssembly module results in corrupted buffer reads and fatal execution errors.20

Due to this severe limitation, the industry standard for programmatic metadata extraction in JavaScript environments requires adopting one of two architectural pathways. The first pathway is the Template Route. This involves programmatically converting, or operationally requiring the user to save, the report as a .pbit template.7 By doing so, the architecture bypasses the Xpress9 algorithm entirely, allowing the Node.js application to directly read the uncompressed DataModelSchema JSON file.7 The second pathway involves a Python Bridge. This utilizes a native binary parser, such as the duckdb-pbix-extension written in C++, which handles the memory mapping and Xpress9 decompression natively.22 Node.js can then spawn a child process to execute a Python script leveraging the pbixray library, which interprets the DuckDB output and passes the clean metadata back to the Node.js parent process via standard output.23

## **Power BI Metadata Languages and Schema Topography**

Once access to the uncompressed schema is secured—either via a .pbit template or a bridged decompression module—the subsequent phase requires traversing the semantic hierarchy. Power BI relies heavily on the Microsoft Analysis Services Tabular engine, and the declarative languages used to define these metadata models have evolved significantly over time.

### **Tabular Object Model (TOM) and Tabular Model Scripting Language (TMSL)**

Historically, Power BI and SQL Server Analysis Services (SSAS) utilized the Tabular Model Scripting Language (TMSL) to serialize database schemas.25 TMSL is a comprehensive, JSON-based command and object model syntax.27 When a Node.js parser interacts with the DataModelSchema file extracted from a .pbit archive, it is essentially reading a massive JSON document that conforms to a localized variant of the TMSL specification.7

The Tabular Object Model (TOM) is the underlying C\# /.NET library that serializes and deserializes these TMSL JSON structures.29 TOM provides the programmable API used by enterprise developers and third-party tools like Tabular Editor to programmatically alter the model.27 While TOM is restricted to the.NET ecosystem, understanding its relationship to TMSL is crucial, as the JSON structure encountered by a Node.js parser is a direct, one-to-one reflection of the TOM class hierarchy.

### **Tabular Model Definition Language (TMDL): The Future Paradigm**

While TMSL is highly effective for machine-to-machine serialization, its structure presents severe operational challenges for human readability and version control.25 A TMSL JSON file for a complex enterprise data model often spans tens of thousands of lines in a single monolithic document, making collaborative development, Git diffing, and modular programmatic extraction highly inefficient.25

To resolve these architectural limitations, Microsoft introduced the Tabular Model Definition Language (TMDL).29 TMDL represents a fundamental paradigm shift from a monolithic JSON file to a folder-based, YAML-like syntax structure.27 In a TMDL-formatted Power BI Project (identified by the new .pbip extension), the data model is no longer housed in a single file.32 Instead, each table, perspective, role, culture, and measure is stored in its own dedicated text file.25 TMDL utilizes minimal delimiters and relies heavily on indentation to indicate parent-child relationships between objects, mirroring the syntax style of Python or YAML.27

For a comprehensive Node.js parsing utility, understanding both the legacy and modern formats is an absolute necessity. While modern .pbip project files utilize the modular TMDL directory structure 32, the vast majority of existing legacy .pbix and .pbit files in enterprise environments continue to embed the monolithic DataModelSchema JSON format.7

### **Extracting the Schema: Tables, Columns, Relationships, and Expressions**

When a programmatic parser evaluates the DataModelSchema JSON extracted from a .pbit file, it encounters a strictly defined hierarchical topology. A robust extraction algorithm must target specific JSON paths to accurately map the complete architecture of the data model.

The root of the entire semantic model resides within the model object. All subsequent data definitions branch from this central node.

#### **Table and Column Extraction**

Within the model object, the tables array contains the definitions for every imported, calculated, and hidden table within the report.7 The table's primary identifier is extracted from the model.tables.name property.7

Nested within each table definition is the columns array (model.tables.columns), which houses the schema for the table. Each column object contains critical metadata properties. The name property provides the column identifier, while the dataType property explicitly defines the memory allocation type, such as string, int64, double, or dateTime.35 Furthermore, the isHidden boolean flag indicates whether the column is visible to the end-user in the report authoring interface.36

If a column is not imported from a source database but is instead generated via a calculation, it will contain a type: "calculated" attribute.37 In these instances, the object will also feature an expression property containing the raw, uncompiled DAX string that generates the column's values.13 Capturing this DAX expression is vital for documenting the internal business logic of the semantic model.

#### **DAX Measure Extraction**

Measures represent dynamic calculations evaluated at query time, reacting to user filters and slicers. Structurally, they are similar to calculated columns but reside in a distinctly separate array within each table definition: model.tables.measures.38 An exhaustive parser must iterate through this array, capturing the name of the measure, the expression property containing the complex DAX formula, and the formatString property, which dictates how the resulting numerical value is displayed (e.g., as a currency or percentage) to fully document the measure's analytical behavior.39

#### **Relationship Mapping**

Relationships form the connective tissue of the semantic model, dictating how filter context propagates across tables and defining the overall cardinality of the schema (e.g., one-to-many, many-to-many).36 These definitions are stored globally under the model.relationships array.34

Extracting these relationships is critical for reconstructing the entity-relationship diagram. The parser must isolate the fromTable and fromColumn properties to identify the source of the relationship, alongside the toTable and toColumn properties to identify the target.37 Additionally, the crossFilteringBehavior property must be parsed to determine whether filters flow in a single direction or in both directions, which profoundly impacts the analytical output.36 Finally, the isActive boolean property indicates if the relationship is the primary active path for the query engine, as a model may contain multiple inactive relationships between the same two tables for advanced DAX scenarios.34

#### **Power Query (M) Lineage Extraction**

The ETL (Extract, Transform, Load) logic governing how data is initially ingested, cleaned, and shaped before entering the tabular engine is defined using the M formula language. This critical lineage data is found deeply nested within the JSON under model.tables.partitions.source.expression.7 Extracting this M script provides a complete, unbroken lineage trail back to the original SQL database, REST API endpoint, or flat file source, allowing data engineers to audit upstream dependencies automatically.40

### **The Python and Node.js Open-Source Ecosystem**

The open-source community has developed several tools and libraries to facilitate this intricate extraction process, bridging the gap between Microsoft's proprietary formats and open programming languages.

The most notable tool in the Python ecosystem is PBIXRay. This highly sophisticated library is designed to parse and analyze .pbix files directly.23 It ingeniously leverages the DuckDB duckdb-pbix-extension to circumvent the Xpress9 compression issue.22 By executing native C++ decompression, it maps the binary model into memory and exposes the metadata tables directly to Python.22 PBIXRay abstracts the complexity of the underlying schemas, allowing developers to access properties like model.tables, model.schema, and model.relationships via standardized Pandas DataFrames.23

Within the Node.js and TypeScript ecosystem, developers can utilize the powerbi-models NPM package. Maintained actively, this package provides exhaustive TypeScript interfaces, JSON schema definitions, and validation functions for Power BI object models.42 While this specific library does not handle file decompression or unzipping, incorporating its interfaces into a custom parser ensures that the deserialized DataModelSchema JSON is strongly typed, significantly reducing runtime errors during deep object traversal.42

## **TypeScript Implementation for Power BI Metadata Extraction**

Implementing a programmatic parser in Node.js requires orchestrating asynchronous file system operations, managing ZIP archive extraction directly in memory, and executing deep, recursive JSON traversal.

The following TypeScript implementation demonstrates an architectural approach for extracting metadata from a .pbit file. It utilizes the adm-zip package for archive traversal and defines strict interfaces based on the documented TMSL specification to ensure type safety.

TypeScript

import \* as fs from 'fs';  
import AdmZip from 'adm-zip';

// Define strictly typed interfaces reflecting the TMSL/DataModelSchema JSON architecture  
interface PbiColumn {  
    name: string;  
    dataType: string;  
    isHidden?: boolean;  
    type?: string;  
    expression?: string; // DAX string for calculated columns  
}

interface PbiMeasure {  
    name: string;  
    expression: string; // The analytical DAX formula  
    formatString?: string;  
}

interface PbiTable {  
    name: string;  
    columns?: PbiColumn;  
    measures?: PbiMeasure;  
    isHidden?: boolean;  
}

interface PbiRelationship {  
    name: string;  
    fromTable: string;  
    fromColumn: string;  
    toTable: string;  
    toColumn: string;  
    crossFilteringBehavior?: string;  
    isActive?: boolean;  
}

interface DataModelSchema {  
    model: {  
        tables: PbiTable;  
        relationships?: PbiRelationship;  
    };  
}

class PowerBIMetadataExtractor {  
    /\*\*  
     \* Extracts, decodes, and parses the DataModelSchema from a.pbit archive.  
     \* @param pbitFilePath The absolute or relative system path to the.pbit file.  
     \* @returns A strongly-typed DataModelSchema object.  
     \*/  
    public static extractMetadata(pbitFilePath: string): DataModelSchema {  
        const zip \= new AdmZip(pbitFilePath);  
        const zipEntries \= zip.getEntries();  
          
        let schemaContent: string | null \= null;

        // Traverse the uncompressed ZIP archive stream to locate the schema file  
        for (const entry of zipEntries) {  
            if (entry.entryName \=== 'DataModelSchema') {  
                // TMSL JSON is predominantly serialized with UTF-16LE encoding by Analysis Services  
                schemaContent \= entry.getData().toString('utf16le');   
                break;  
            }  
        }

        if (\!schemaContent) {  
            throw new Error('DataModelSchema file not found. Ensure the provided file is a valid.pbit template format.');  
        }

        // Clean null bytes and invisible control characters that frequently manifest during Microsoft JSON serialization  
        const sanitizedContent \= schemaContent.replace(/\[\\u0000-\\u001F\]+/g, "");  
          
        return JSON.parse(sanitizedContent) as DataModelSchema;  
    }

    /\*\*  
     \* Flattens the deep hierarchical JSON model into a readable relational report format.  
     \* @param schema The typed DataModelSchema object.  
     \*/  
    public static generateReport(schema: DataModelSchema): void {  
        console.log(\`--- Power BI Semantic Model Extraction \---\`);  
        console.log(\`Total Tables Detected: ${schema.model.tables.length}\`);  
          
        schema.model.tables.forEach(table \=\> {  
            console.log(\`\\nTable Definition: ${table.name}\`);  
              
            table.columns?.forEach(col \=\> {  
                const calcFlag \= col.type \=== 'calculated'? '\[Calculated\]' : '';  
                console.log(\`  \- Column: ${col.name} (${col.dataType}) ${calcFlag}\`);  
            });  
              
            table.measures?.forEach(measure \=\> {  
                // Truncate DAX expressions for console output readability  
                const truncatedDax \= measure.expression.length \> 50   
                   ? \`${measure.expression.substring(0, 50)}...\`   
                    : measure.expression;  
                console.log(\`  \- Measure: ${measure.name} | DAX: ${truncatedDax}\`);  
            });  
        });

        console.log(\`\\nRelational Topology:\`);  
        schema.model.relationships?.forEach(rel \=\> {  
            const activeStatus \= rel.isActive \=== false? '(Inactive)' : '(Active)';  
            const filterDirection \= rel.crossFilteringBehavior \=== 'both'? '\<-\>' : '-\>';  
            console.log(\`  ${rel.fromTable}\[${rel.fromColumn}\] ${filterDirection} ${rel.toTable}\[${rel.toColumn}\] ${activeStatus}\`);  
        });  
    }  
}

If organizational or architectural requirements strictly dictate that the Node.js application must read compiled .pbix files directly—thereby precluding the .pbit conversion workaround—the Node.js application must be designed to orchestrate a child process. This child process invokes a Python shell environment executing the pbixray library.23 The Python script performs the complex C++ DuckDB bindings to decompress the Xpress9 binary stream, extracts the metadata into memory, serializes it into a standardized JSON format, and pipes it back to the Node.js parent process via stdout.23 This microservices-style bridge represents the only reliable methodology for handling native .pbix data models in a JavaScript environment.

## **Architectural Analysis of Tableau File Formats**

Salesforce Tableau employs an architectural philosophy that is radically different from Microsoft Power BI. Instead of relying on proprietary, opaque binary compression algorithms for its core metadata storage, Tableau relies entirely on highly readable, extensible markup languages and standardized, universally recognized ZIP archives.

### **The XML Schema Topology of.twb Files**

A .twb (Tableau Workbook) file is not a binary blob; it is fundamentally a structured, unencrypted, completely plaintext XML document.43 It contains absolutely no row-level data payload.44 Instead, it serves as a massive declarative configuration file. It defines the entire analytical and visual state of the workbook, including the precise database connection strings, the geometric layout of the dashboards, the definition of complex calculated fields, and the relational topology of the semantic model.45

Because it is standard XML, it bypasses the decompression hurdles associated with Power BI. Any compliant, highly performant lexical parser within the Node.js ecosystem—such as xml2js, fast-xml-parser, or native DOM parsers—can ingest the .twb file, traverse its Document Object Model (DOM), and extract metadata with programmatic ease.46

### **Unpacking.twbx Packaged Workbooks**

While the .twb file represents the metadata, Tableau provides the .twbx (Tableau Packaged Workbook) format to facilitate the sharing of reports alongside their underlying data.44 A .twbx file is simply a standard ZIP archive designed for portability.44 Unpacking a .twbx file via programmatic unzipping reveals a highly predictable internal directory structure.

The archive contains the root .twb XML metadata document, completely unaltered from its standalone state.44 Alongside it resides a Data directory, which contains the highly compressed, proprietary data extracts. Historically, these were formatted as .tde (Tableau Data Extract) files, but in modern architectures, they utilize the .hyper (Hyper Data Engine) format, which is optimized for high-speed analytical querying.46 Additionally, an Image directory is present, housing static assets, custom shapes, and corporate logos utilized within the dashboards.48

To parse a .twbx file programmatically, a Node.js implementation merely needs to read the ZIP directory structure into memory, isolate the .twb file by checking the file extension, extract it, and load its XML payload into an XML-to-JSON parsing library.49 The proprietary .hyper files can be completely ignored if the sole objective is schema metadata extraction.

### **The 2020.2 Semantic Shift: Logical vs. Physical Layers**

Understanding Tableau's metadata requires a deep, nuanced comprehension of the massive paradigm shift introduced by Salesforce in Tableau version 2020.2.51 Prior to this version, Tableau utilized a strictly "flat" data model concept. Tables were combined exclusively via physical SQL joins (Inner, Left, Right, Full Outer), resulting in a single, flattened virtual table.51 This legacy architecture suffered from massive data duplication (fan-out) when joining tables at different levels of granularity, severely complicating aggregation logic.51

Post-2020.2, Tableau entirely overhauled its data modeling engine, introducing a sophisticated bipartite semantic model comprising a distinct Logical Layer and a distinct Physical Layer.43

The Physical Layer represents the underlying database tables exactly as they exist in the source system. In the XML schema, these are joined together using traditional SQL join logic exactly as before, but crucially, they are now encapsulated and hidden inside "Logical Tables".43

The Logical Layer introduces Logical Tables, which act as virtual containers representing distinct, normalized analytical entities (e.g., "Sales Transactions", "Customer Demographics").43 These Logical Tables are not joined using rigid SQL; instead, they are connected via "Relationships" (colloquially known within the Tableau community as "noodles").43 Relationships do not define a strict SQL join type ahead of time.54 Instead, they define a flexible linkage based on common keys, allowing Tableau's query engine to dynamically generate the most efficient, context-aware join at runtime based exclusively on the specific Level of Detail required by the visualization the user is currently interacting with.52

When parsing the .twb XML, this complex architecture is explicitly represented. The XML utilizes \<relation type='logical'\> nodes to dictate the high-level relationships, which in turn wrap deeply nested \<relation type='table'\> or \<relation type='join'\> nodes that dictate the legacy physical layer constraints.43 A modern parser must distinguish between these two layers to accurately reconstruct the semantic model.

## **Tableau Metadata Representation and Extraction Modalities**

Extracting meaningful metadata from the .twb XML requires targeted XPath queries or deep JSON traversal (if the XML has been converted via a library like xml2js). The schema is logical, but its nested nature demands precise targeting.

### **Traversing Data Sources, Connections, and Columns**

The root element of every .twb file is the \<workbook\> tag. Within this root, the primary target for data modeling extraction is the \<datasources\> array.43 This array contains a separate \<datasource\> node for every connection utilized by the report.

Each \<datasource\> node is heavily populated with critical metadata. The connection parameters are located within the \<connection\> tag, which details the specific database driver class, server IP addresses, database names, and the authentication schema utilized.48

The object model itself is defined within the \<relation\> tags, representing the aforementioned Physical and Logical tables. A standard physical source table is defined as \<relation type='table' name='\[dbo\].'\>.43

Column metadata is localized within \<column\> tags appended directly under the datasource definition.45 Each column node contains a myriad of vital attributes that must be extracted. The name attribute provides the internal reference identifier (e.g., \[Customer Name\]), which is used in all underlying calculations.45 The caption attribute, if present, overrides the internal name and represents the human-readable alias shown in the Tableau UI.45 The datatype attribute specifies the exact data type (e.g., string, integer, real, datetime).45 The role attribute specifies whether the field functions analytically as a dimension (used for slicing data) or a measure (used for aggregating data).55 Finally, the type attribute indicates if the field is nominal, ordinal, or quantitative.45

### **Deciphering Calculated Fields and Level of Detail (LOD) Expressions**

Unlike Power BI, which relies on a separate DAX engine, Tableau handles all dynamic calculations natively within its expression language, serialized entirely within the XML. If a \<column\> node represents a calculated field created by the user, it will contain a deeply nested \<calculation\> node.45

The formula attribute of this \<calculation\> node contains the raw, uncompiled Tableau expression syntax.48 Extracting standard calculations, such as basic arithmetic aggregations like SUM() / SUM(\[Profit\]), is straightforward.58

However, the most valuable business logic resides in Level of Detail (LOD) expressions. LOD expressions allow analysts to compute aggregations at a granularity distinct from the visualization level, overcoming the constraints of the standard view-level detail.56 These expressions utilize the FIXED, INCLUDE, or EXCLUDE keywords.56 For example, a formula might read { FIXED : AVG() }.56 These expressions are fully visible in the XML formula attributes. Extracting these \<calculation\> nodes and identifying LOD keywords via regular expressions is paramount for documenting the complex, hidden business logic embedded within the workbook that dictates financial or operational reporting outputs.

### **Relational Mapping in the Logical Layer**

To accurately map the relationships defining the model, the parser must inspect either the \<document-format-change-manifest\> node or the \<relation type='logical'\> nodes, depending on the exact build version of the workbook post-2020.2. The XML defines the relationship keys linking the tables (e.g., specifying that . \=.) and outlines the expected cardinality constraints (e.g., Many-to-One).43 By extracting these pairs and tracing their lineage back to the logical table definitions, a complete bipartite graph of the semantic model can be programmatically reconstructed, providing a visual map of how data flows through the dashboard.

Open-source implementations have successfully demonstrated these techniques. Libraries like twbparser (written in R) 48 and TableauDesktopPy (written in Python) 60 utilize extensive XML traversal techniques to precompute relationships, map field dependencies, and generate extraction manifests. These libraries serve as robust architectural blueprints for Node.js implementations.

## **TypeScript Implementation for Tableau Metadata Extraction**

The following TypeScript code utilizes the xml2js library to parse a .twb XML string. This string can be easily extracted from a .twbx archive via adm-zip in a manner completely analogous to the Power BI example.

TypeScript

import { parseStringPromise } from 'xml2js';  
import \* as fs from 'fs';

// Interfaces mapping specifically to the expected xml2js output of the.twb XML schema  
interface TableauColumn {  
    $: {  
        name: string;  
        datatype: string;  
        role: string;  
        type: string;  
        caption?: string;  
    };  
    calculation?: Array\<{  
        $: {  
            class: string;  
            formula: string; // The raw analytical expression or LOD  
        }  
    }\>;  
}

interface TableauDatasource {  
    $: {  
        name: string;  
        caption?: string;  
    };  
    connection?: Array\<any\>;  
    column?: TableauColumn;  
}

class TableauMetadataExtractor {  
    /\*\*  
     \* Parses a raw.twb XML string into a structured, readable metadata report.  
     \* @param xmlContent The raw XML string read from the.twb file.  
     \*/  
    public static async extractMetadata(xmlContent: string): Promise\<void\> {  
        try {  
            // Convert the hierarchical XML into a traversable JavaScript object  
            // explicitArray ensures single-child nodes are still treated as arrays for consistent iteration  
            const parsedXml \= await parseStringPromise(xmlContent, { explicitArray: true });  
              
            // Isolate the datasources array which houses the semantic models  
            const datasources: TableauDatasource \= parsedXml.workbook.datasources.datasource;

            console.log(\`--- Tableau Data Model Extraction \---\`);  
            console.log(\`Total Configured Data Sources: ${datasources.length}\`);

            datasources.forEach(ds \=\> {  
                // Filter out internal Tableau parameters/worksheets that clutter the output  
                if (ds.$.name \=== 'Parameters') return;

                const dsName \= ds.$.caption |

| ds.$.name;  
                console.log(\`\\nData Source Target: ${dsName}\`);

                if (ds.column) {  
                    ds.column.forEach(col \=\> {  
                        const attr \= col.$;  
                        const colName \= attr.caption |

| attr.name;  
                          
                        // Check if the column node contains a nested calculation node  
                        const calcNode \= col.calculation? col.calculation.$ : null;

                        if (calcNode && calcNode.formula) {  
                            // Clean up newline characters from the formula for console presentation  
                            const cleanFormula \= calcNode.formula.replace(/\\r?\\n|\\r/g, " ");  
                            console.log(\`  \- Calculated Field: ${colName}\`);  
                            console.log(\`    Formula Logic: ${cleanFormula}\`);  
                        } else {  
                            console.log(\`  \- Physical Column: ${colName}\`);  
                        }  
                    });  
                }  
            });

            // Note on Relationships: Relationship parsing requires recursive traversal of the \<relation\> nodes.  
            // These nodes are heavily nested and structurally variable depending on whether the   
            // author utilized legacy Physical joins or modern Logical relationships (post 2020.2).  
              
        } catch (error) {  
            console.error('Fatal Error: Failed to parse Tableau XML structure:', error);  
        }  
    }  
}

## **Minimum Viable Extraction (MVE) and Comparative Limitations**

When designing a unified programmatic pipeline tasked with handling both Power BI and Tableau architectures simultaneously, the highly disparate data structures must be reconciled and normalized into an agnostic format.

### **Defining the MVE Baseline**

The Minimum Viable Extraction (MVE) matrix represents the lowest common denominator of metadata required to successfully reconstruct a functional data dictionary, a lineage graph, or automated schema documentation across any BI platform.

| Metadata Component | Power BI Extracted Path (JSON) | Tableau Extracted Path (XML) |
| :---- | :---- | :---- |
| **Table Names** | model.tables.name | \<relation type='table' name='...'\> |
| **Column Names** | model.tables.columns.name | \<column name='...'\> |
| **Data Types** | model.tables.columns.dataType | \<column datatype='...'\> |
| **Relationships** | model.relationships | \<relation type='logical'\> logic |
| **Calculated Fields/Logic** | model.tables.measures.expression | \<calculation formula='...'\> |

Extracting these five specific elements allows an external Node.js application to perfectly catalog the semantic layer.24 This enables downstream documentation generators, such as automated wikis, enterprise data catalogs, or LLM-driven analysis agents, to function autonomously regardless of the origin platform.

### **Inherent Architectural Limitations and Encrypted Payloads**

Despite the implementation of robust parsing architectures, several absolute, hard limitations exist across both Microsoft and Salesforce platforms that can completely thwart offline file parsing.

Firstly, the issue of DirectQuery and Live Connections. If a Power BI .pbix file is architected using a Live Connection to an existing SSAS cube, a remote Power BI Premium dataset, or a DirectQuery SQL database, the DataModel binary file will simply not exist within the local archive.62 The .pbix file acts purely as a thin client, storing only the connection string and the visual layout. Full metadata extraction in this specific scenario requires authenticating against the Power BI REST API or the XMLA endpoint over the network 26, bypassing local file parsing entirely.

Secondly, a similar dichotomy exists between Tableau Server and Tableau Desktop files. Tableau Data Sources that are published directly to Tableau Server (saved as .tdsx files) operate conceptually similarly to Live Connections. A local .twb file connected to a hosted Tableau Server data source will only contain the connection reference URL, not the underlying column definitions or LOD expressions. To access this metadata, the server-side data source must be physically downloaded, or the application must utilize the Tableau Metadata API (which operates via GraphQL) to query the server remotely.63

Finally, the challenge of Encrypted Archives. Both Microsoft and Salesforce provide robust enterprise mobility mechanisms for at-rest file encryption, such as Microsoft Information Protection sensitivity labels. If a .pbix or .twbx file is encrypted via these enterprise frameworks, the entire ZIP archive is obfuscated. Standard ZIP extraction libraries in Node.js will fail immediately, throwing invalid header exceptions. Decryption in these scenarios requires proper Active Directory token brokering and access to Microsoft's or Salesforce's respective decryption SDKs prior to executing any parsing logic.

## **Legal Constraints, Licensing, and Reverse Engineering Considerations**

The programmatic extraction of proprietary file formats inevitably raises significant questions regarding End User License Agreements (EULAs), copyright infringement, and the precise legality of reverse engineering software. Engineering teams must navigate these boundaries carefully.

### **End User License Agreements (EULA) and Interoperability Statutes**

Microsoft's Power BI Desktop EULA explicitly states that users may not "work around any technical limitations in the software" or "reverse engineer, decompile or disassemble the software".64 Salesforce Tableau maintains similar, heavily litigated boilerplate constraints against reverse engineering its proprietary binaries, executables, and internal codebases.

However, the legal landscape surrounding reverse engineering for the explicit purpose of interoperability and metadata extraction is highly nuanced and generally favorable to the developer, provided certain boundaries are respected.65

A critical legal distinction exists between the Software Engine and the User Data. The EULAs primarily protect the software engine—the compiled executable binaries that run the Power BI and Tableau applications. Parsing an XML document (.twb) or a JSON file (.pbit) generated by the user does not constitute reverse engineering the software executable; it is merely reading a serialized data structure that contains the user's own intellectual property.45

Furthermore, the Interoperability Exemption provides legal cover in many jurisdictions. Under statutes such as Section 1201(f) of the US Digital Millennium Copyright Act (DMCA), and analogous provisions within the EU Software Directive, reverse engineering a file format or a communication protocol is legally permissible if the sole, demonstrable purpose is to achieve interoperability between distinct, independently created software systems.67 Building a custom Node.js parser to catalog tables and columns for integration into a third-party corporate governance tool fits neatly into the established legal definition of interoperability.

Finally, regarding Trade Secrets, reverse engineering only violates trade secret laws if proprietary, protected source code or confidential algorithms are misappropriated or stolen.66 Reading unencrypted XML/JSON manifests, or decompressing an archive utilizing publicly documented algorithms—such as the MS-XCA protocol published openly by Microsoft—relies exclusively on publicly observable file states and standard computational mathematics, not misappropriated trade secrets.12

Consequently, parsing .twb XML files or .pbit JSON schemas presents negligible legal risk. Attempting to decompile or reverse engineer the closed-source Xpress9 compiled C++ binaries specifically to bypass software licensing or DRM would unequivocally cross legal boundaries, but programmatically reading the resulting user-generated data outputs utilizing documented protocols does not.

## **Conclusion**

The programmatic extraction of data model metadata from Power BI and Tableau is a highly complex but entirely achievable engineering objective. While Tableau's XML-based .twb architecture provides a transparent, readily traversable Document Object Model for Node.js parsers, Power BI presents a significantly more guarded ecosystem. Due to the impenetrable nature of the MS-Xpress9 binary compression embedded within standard .pbix files, engineers must adapt their architectural pipelines to leverage .pbit JSON templates, adopt modern .pbip TMDL text hierarchies, or construct native Python microservice bridges utilizing DuckDB. By strictly adhering to the Minimum Viable Extraction matrix, organizations can successfully unlock their localized semantic models, effectively bridging the chasm between proprietary BI black-boxes and automated, enterprise-wide data governance and lineage solutions.

#### **Works cited**

1. Reverse Engineering Power BI. How to safely decompile, modify, and… | by Peyman Farahani | Medium, accessed February 27, 2026, [https://medium.com/@peymanffarahani/reverse-engineering-power-bi-a7a25e496ca6](https://medium.com/@peymanffarahani/reverse-engineering-power-bi-a7a25e496ca6)  
2. What makes up a Power BI Desktop PBIX File \- FourMoo | Microsoft Fabric, accessed February 27, 2026, [https://www.fourmoo.com/2017/05/02/what-makes-up-a-power-bi-desktop-pbix-file/](https://www.fourmoo.com/2017/05/02/what-makes-up-a-power-bi-desktop-pbix-file/)  
3. DataModelSchema in PBIX file \- Microsoft Fabric Community, accessed February 27, 2026, [https://community.fabric.microsoft.com/t5/Desktop/DataModelSchema-in-PBIX-file/td-p/878759](https://community.fabric.microsoft.com/t5/Desktop/DataModelSchema-in-PBIX-file/td-p/878759)  
4. Dissecting a Power BI Dashboard. PBIX files are zipped folders and… | by Victor Angelo Blancada | Medium, accessed February 27, 2026, [https://medium.com/@gelo.blancada/dissecting-a-power-bi-dashboard-1e5017e69974](https://medium.com/@gelo.blancada/dissecting-a-power-bi-dashboard-1e5017e69974)  
5. python \- Power BI(PBIX) \- Parsing Layout file \- Stack Overflow, accessed February 27, 2026, [https://stackoverflow.com/questions/66831049/power-bipbix-parsing-layout-file](https://stackoverflow.com/questions/66831049/power-bipbix-parsing-layout-file)  
6. Power BI Meta Data extraction using Python \- Indium, accessed February 27, 2026, [https://www.indium.tech/blog/power-bi-meta-data-extraction-using-python/](https://www.indium.tech/blog/power-bi-meta-data-extraction-using-python/)  
7. Is there a way to get the PowerBI SQL tables and queries being used via powershell?, accessed February 27, 2026, [https://stackoverflow.com/questions/75007240/is-there-a-way-to-get-the-powerbi-sql-tables-and-queries-being-used-via-powershe](https://stackoverflow.com/questions/75007240/is-there-a-way-to-get-the-powerbi-sql-tables-and-queries-being-used-via-powershe)  
8. DataModel decompression \- Microsoft Fabric Community, accessed February 27, 2026, [https://community.fabric.microsoft.com/t5/Desktop/DataModel-decompression/m-p/777998](https://community.fabric.microsoft.com/t5/Desktop/DataModel-decompression/m-p/777998)  
9. Power BI File Types & Project Organisation: Guide for Marketing Teams \- Catchr, accessed February 27, 2026, [https://www.catchr.io/university/power-bi-lessons/power-bi-file-organization](https://www.catchr.io/university/power-bi-lessons/power-bi-file-organization)  
10. How to decompress DataModel from PBIX file. \- Microsoft Fabric Community, accessed February 27, 2026, [https://community.fabric.microsoft.com/t5/Desktop/How-to-decompress-DataModel-from-PBIX-file/m-p/523811](https://community.fabric.microsoft.com/t5/Desktop/How-to-decompress-DataModel-from-PBIX-file/m-p/523811)  
11. Power BI extract .pbix and decode DataModel from XPress9 \- Stack Overflow, accessed February 27, 2026, [https://stackoverflow.com/questions/69147959/power-bi-extract-pbix-and-decode-datamodel-from-xpress9](https://stackoverflow.com/questions/69147959/power-bi-extract-pbix-and-decode-datamodel-from-xpress9)  
12. \[MS-XCA\]: Xpress Compression Algorithm \- Microsoft Learn, accessed February 27, 2026, [https://learn.microsoft.com/en-us/openspecs/windows\_protocols/ms-xca/a8b7cb0a-92a6-4187-a23b-5e14273b96f8](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-xca/a8b7cb0a-92a6-4187-a23b-5e14273b96f8)  
13. PyDaxExtract — PyDaxExtract 0.2.1 documentation, accessed February 27, 2026, [https://pydaxextract.readthedocs.io/](https://pydaxextract.readthedocs.io/)  
14. A Scalable Multi-Engine Xpress9 Compressor with Asynchronous Data Transfer, accessed February 27, 2026, [https://people.ece.uw.edu/hauck/publications/JooYoungCompression.pdf](https://people.ece.uw.edu/hauck/publications/JooYoungCompression.pdf)  
15. coderforlife/ms-compress: Open source implementations of Microsoft compression algorithms \- GitHub, accessed February 27, 2026, [https://github.com/coderforlife/ms-compress](https://github.com/coderforlife/ms-compress)  
16. decompress \- NPM, accessed February 27, 2026, [https://www.npmjs.com/package/decompress](https://www.npmjs.com/package/decompress)  
17. Express compression middleware, accessed February 27, 2026, [https://expressjs.com/en/resources/middleware/compression.html](https://expressjs.com/en/resources/middleware/compression.html)  
18. How to decompress files in Node.js with zlib \- CoreUI, accessed February 27, 2026, [https://coreui.io/answers/how-to-decompress-files-in-nodejs-with-zlib/](https://coreui.io/answers/how-to-decompress-files-in-nodejs-with-zlib/)  
19. Efficient Data Transfer: Gzip Decompression in Node.js Server and Client-side Compression with Pako | by Lahari Putty | Medium, accessed February 27, 2026, [https://medium.com/@laharichoudary5.lp/efficient-data-transfer-gzip-decompression-in-node-js-server-and-client-side-compression-with-pako-8024fb1c1344](https://medium.com/@laharichoudary5.lp/efficient-data-transfer-gzip-decompression-in-node-js-server-and-client-side-compression-with-pako-8024fb1c1344)  
20. Best way to read/write/parse complex binary files in node.js \- Reddit, accessed February 27, 2026, [https://www.reddit.com/r/node/comments/94373d/best\_way\_to\_readwriteparse\_complex\_binary\_files/](https://www.reddit.com/r/node/comments/94373d/best_way_to_readwriteparse_complex_binary_files/)  
21. How to decompress binary data in node js \- javascript \- Stack Overflow, accessed February 27, 2026, [https://stackoverflow.com/questions/58256846/how-to-decompress-binary-data-in-node-js](https://stackoverflow.com/questions/58256846/how-to-decompress-binary-data-in-node-js)  
22. Duckdb extension for parsing the metadata and contents of the embedded data mode in PowerBI pbix files \- GitHub, accessed February 27, 2026, [https://github.com/Hugoberry/duckdb-pbix-extension](https://github.com/Hugoberry/duckdb-pbix-extension)  
23. Hugoberry/pbixray: PowerBI (pbix) file parser. Surfaces metadata and VertiPaq tables from PowerBI DataModel. \- GitHub, accessed February 27, 2026, [https://github.com/Hugoberry/pbixray](https://github.com/Hugoberry/pbixray)  
24. Building a Power BI Auto-Documentation Pipeline: Implementation (Part 2\) \- Medium, accessed February 27, 2026, [https://medium.com/@michael.hannecke/building-a-power-bi-auto-documentation-pipeline-implementation-part-2-3151241eb979](https://medium.com/@michael.hannecke/building-a-power-bi-auto-documentation-pipeline-implementation-part-2-3151241eb979)  
25. Understanding the Power BI Semantic Model Folder Structure: TMDL vs TMSL and Source Control Advantages | by Furkan İslamoğlu | Medium, accessed February 27, 2026, [https://medium.com/@islafurkan/understanding-the-power-bi-semantic-model-folder-structure-tmdl-vs-tmsl-and-source-control-a41880bbf2a7](https://medium.com/@islafurkan/understanding-the-power-bi-semantic-model-folder-structure-tmdl-vs-tmsl-and-source-control-a41880bbf2a7)  
26. Semantic model connectivity and management with the XMLA endpoint in Power BI \- Microsoft Fabric, accessed February 27, 2026, [https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/service-premium-connect-tools](https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/service-premium-connect-tools)  
27. Announcing public preview of the Tabular Model Definition Language (TMDL), accessed February 27, 2026, [https://powerbi.microsoft.com/en-us/blog/announcing-public-preview-of-the-tabular-model-definition-language-tmdl/](https://powerbi.microsoft.com/en-us/blog/announcing-public-preview-of-the-tabular-model-definition-language-tmdl/)  
28. How to change the dataset script in Power BI desktop \- Kasper On BI, accessed February 27, 2026, [https://www.kasperonbi.com/how-to-change-the-dataset-script-in-power-bi-desktop/](https://www.kasperonbi.com/how-to-change-the-dataset-script-in-power-bi-desktop/)  
29. Why Power BI developers should care about the Tabular Model Definition Language (TMDL) | endjin, accessed February 27, 2026, [https://endjin.com/blog/2025/01/why-power-bi-developers-should-care-about-the-tabular-model-definition-language-tmdl](https://endjin.com/blog/2025/01/why-power-bi-developers-should-care-about-the-tabular-model-definition-language-tmdl)  
30. Development tools for Tabular models in 2021 \- SQLBI, accessed February 27, 2026, [https://www.sqlbi.com/articles/development-tools-for-tabular-models-in-2021/](https://www.sqlbi.com/articles/development-tools-for-tabular-models-in-2021/)  
31. Introducing TMDL for Power BI\! (with Mathias Thierbach) \- YouTube, accessed February 27, 2026, [https://www.youtube.com/watch?v=adP0U4dAQqs](https://www.youtube.com/watch?v=adP0U4dAQqs)  
32. Power BI Desktop projects (PBIP) \- Microsoft, accessed February 27, 2026, [https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview](https://learn.microsoft.com/en-us/power-bi/developer/projects/projects-overview)  
33. Everything you need to know about PBIP Power BI files \- Blog de Bismart, accessed February 27, 2026, [https://blog.bismart.com/en/power-bi-pbip-files](https://blog.bismart.com/en/power-bi-pbip-files)  
34. Create and Manage Relationships in Power BI Desktop \- Microsoft, accessed February 27, 2026, [https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-create-and-manage-relationships](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-create-and-manage-relationships)  
35. Data types in Power BI Desktop \- Microsoft, accessed February 27, 2026, [https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-data-types](https://learn.microsoft.com/en-us/power-bi/connect-data/desktop-data-types)  
36. Model relationships in Power BI Desktop \- Microsoft, accessed February 27, 2026, [https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-relationships-understand](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-relationships-understand)  
37. Collect and Submit Diagnostic Information \- Power BI | Microsoft Learn, accessed February 27, 2026, [https://learn.microsoft.com/en-us/power-bi/fundamentals/desktop-diagnostics](https://learn.microsoft.com/en-us/power-bi/fundamentals/desktop-diagnostics)  
38. How to parse a JSON column in Power BI \- YouTube, accessed February 27, 2026, [https://www.youtube.com/watch?v=hTARmvFkPgY](https://www.youtube.com/watch?v=hTARmvFkPgY)  
39. How to Document in Power BI Faster: Extract Tables, Column names & Measures with DAX Query View \- YouTube, accessed February 27, 2026, [https://www.youtube.com/watch?v=WkQTHxk6Pc4](https://www.youtube.com/watch?v=WkQTHxk6Pc4)  
40. Trying to access trusted tables from a power bi report using the metadata \- Reddit, accessed February 27, 2026, [https://www.reddit.com/r/learnpython/comments/1onx56z/trying\_to\_access\_trusted\_tables\_from\_a\_power\_bi/](https://www.reddit.com/r/learnpython/comments/1onx56z/trying_to_access_trusted_tables_from_a_power_bi/)  
41. Extract Data from a Power BI Semantic Model Using Python (Locally), accessed February 27, 2026, [https://community.fabric.microsoft.com/t5/Power-BI-Community-Blog/Extract-Data-from-a-Power-BI-Semantic-Model-Using-Python-Locally/ba-p/4686762](https://community.fabric.microsoft.com/t5/Power-BI-Community-Blog/Extract-Data-from-a-Power-BI-Semantic-Model-Using-Python-Locally/ba-p/4686762)  
42. powerbi-models \- NPM, accessed February 27, 2026, [https://www.npmjs.com/package/powerbi-models](https://www.npmjs.com/package/powerbi-models)  
43. The Tableau Data Model, accessed February 27, 2026, [https://help.tableau.com/current/server/en-us/datasource\_datamodel.htm](https://help.tableau.com/current/server/en-us/datasource_datamodel.htm)  
44. Difference between a twb and twbx \- tableau api \- Stack Overflow, accessed February 27, 2026, [https://stackoverflow.com/questions/27774659/difference-between-a-twb-and-twbx](https://stackoverflow.com/questions/27774659/difference-between-a-twb-and-twbx)  
45. Uncovering the Value of Tableau Workbook XML Metadata \- CoEnterprise, accessed February 27, 2026, [https://www.coenterprise.com/blog/uncovering-the-value-of-tableaus-workbook-xml-metadata/](https://www.coenterprise.com/blog/uncovering-the-value-of-tableaus-workbook-xml-metadata/)  
46. Extract Your Data \- Tableau Help, accessed February 27, 2026, [https://help.tableau.com/current/pro/desktop/en-us/extracting\_data.htm](https://help.tableau.com/current/pro/desktop/en-us/extracting_data.htm)  
47. Tableau Blueprint, accessed February 27, 2026, [https://help.tableau.com/current/offline/en-gb/tableau\_blueprint.pdf](https://help.tableau.com/current/offline/en-gb/tableau_blueprint.pdf)  
48. twbparser \- GitHub Pages, accessed February 27, 2026, [https://prigasg.github.io/twbparser/](https://prigasg.github.io/twbparser/)  
49. Extract Filters and Parameters From Tableau XML?, accessed February 27, 2026, [https://commtableau.my.site.com/s/question/0D54T00000C6YNTSA3/extract-filters-and-parameters-from-tableau-xml](https://commtableau.my.site.com/s/question/0D54T00000C6YNTSA3/extract-filters-and-parameters-from-tableau-xml)  
50. Extract Filters and Parameters From Tableau XML? \- Trailhead \- Salesforce, accessed February 27, 2026, [https://trailhead.salesforce.com/trailblazer-community/feed/0D5KX00000kRF550AG](https://trailhead.salesforce.com/trailblazer-community/feed/0D5KX00000kRF550AG)  
51. Tableau 2020.2 \- Relationships \- phData, accessed February 27, 2026, [https://www.phdata.io/blog/tableau-2020-2-relationships/](https://www.phdata.io/blog/tableau-2020-2-relationships/)  
52. Questions about Relationships, the Data Model, and Data Sources \- Tableau Help, accessed February 27, 2026, [https://help.tableau.com/current/pro/desktop/en-us/datasource\_datamodel\_faq.htm](https://help.tableau.com/current/pro/desktop/en-us/datasource_datamodel_faq.htm)  
53. Tableau Relationships: Basics – Logical Layer & Physical Layer \- InterWorks, accessed February 27, 2026, [https://interworks.com/blog/2022/07/29/tableau-relationships-basics-logical-layer-physical-layer/](https://interworks.com/blog/2022/07/29/tableau-relationships-basics-logical-layer-physical-layer/)  
54. Relate Your Data \- Tableau Help, accessed February 27, 2026, [https://help.tableau.com/current/pro/desktop/en-us/relate\_tables.htm](https://help.tableau.com/current/pro/desktop/en-us/relate_tables.htm)  
55. Work with Data Fields in the Data Pane \- Tableau Help, accessed February 27, 2026, [https://help.tableau.com/current/pro/desktop/en-us/datafields\_understanddatawindow.htm](https://help.tableau.com/current/pro/desktop/en-us/datafields_understanddatawindow.htm)  
56. Level of Detail Expressions \- Tableau Help, accessed February 27, 2026, [https://help.tableau.com/current/pro/desktop/en-us/calculations\_calculatedfields\_lod.htm](https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod.htm)  
57. User Functions \- Tableau Help, accessed February 27, 2026, [https://help.tableau.com/current/pro/desktop/en-us/functions\_functions\_user.htm](https://help.tableau.com/current/pro/desktop/en-us/functions_functions_user.htm)  
58. Overview: Level of Detail Expressions \- Tableau Help, accessed February 27, 2026, [https://help.tableau.com/current/pro/desktop/en-us/calculations\_calculatedfields\_lod\_overview.htm](https://help.tableau.com/current/pro/desktop/en-us/calculations_calculatedfields_lod_overview.htm)  
59. Help for package twbparser \- CRAN, accessed February 27, 2026, [https://cran.r-project.org/web/packages/twbparser/refman/twbparser.html](https://cran.r-project.org/web/packages/twbparser/refman/twbparser.html)  
60. TableauDesktopPy \- PyPI, accessed February 27, 2026, [https://pypi.org/project/TableauDesktopPy/](https://pypi.org/project/TableauDesktopPy/)  
61. bpewyllie/TableauDesktopPy: Tools for extracting metadata from Tableau Desktop workbook files. \- GitHub, accessed February 27, 2026, [https://github.com/bpewyllie/TableauDesktopPy](https://github.com/bpewyllie/TableauDesktopPy)  
62. Missing DataModel in pbix file \- Microsoft Fabric Community \- Power BI forums, accessed February 27, 2026, [https://community.powerbi.com/t5/Desktop/Missing-DataModel-in-pbix-file/td-p/1654340](https://community.powerbi.com/t5/Desktop/Missing-DataModel-in-pbix-file/td-p/1654340)  
63. Introduction to Tableau Metadata API, accessed February 27, 2026, [https://help.tableau.com/current/api/metadata\_api/en-us/index.html](https://help.tableau.com/current/api/metadata_api/en-us/index.html)  
64. Desktop EULA | Microsoft Power BI, accessed February 27, 2026, [https://powerbi.microsoft.com/en-us/desktop-eula/](https://powerbi.microsoft.com/en-us/desktop-eula/)  
65. The legality of reverse engineering or how to legally decipher trade secrets \- SHS Web of Conferences, accessed February 27, 2026, [https://www.shs-conferences.org/articles/shsconf/pdf/2023/26/shsconf\_copeji2023\_02001.pdf](https://www.shs-conferences.org/articles/shsconf/pdf/2023/26/shsconf_copeji2023_02001.pdf)  
66. Is "Reverse Engineering" Misappropriation of Trade Secrets?, accessed February 27, 2026, [https://www.fr.com/insights/ip-law-essentials/reverse-engineering-misappropriation-trade-secrets/](https://www.fr.com/insights/ip-law-essentials/reverse-engineering-misappropriation-trade-secrets/)  
67. Is it illegal to reverse engineer a software if the EULA prohibits it for all purposes?, accessed February 27, 2026, [https://law.stackexchange.com/questions/51638/is-it-illegal-to-reverse-engineer-a-software-if-the-eula-prohibits-it-for-all-pu](https://law.stackexchange.com/questions/51638/is-it-illegal-to-reverse-engineer-a-software-if-the-eula-prohibits-it-for-all-pu)