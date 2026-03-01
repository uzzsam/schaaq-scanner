# **Diagnostic Parsing of ETL/ELT Pipeline Definitions for Semantic Column-Level Lineage**

The preservation of semantic meaning across data extraction, transformation, and loading (ETL/ELT) pipelines is a critical imperative for modern data architectures. As data flows from source systems through staging layers into data warehouses, lakehouses, and downstream analytical models, the business logic encapsulated within transformations must remain traceable and mathematically sound. A diagnostic tool designed to parse pipeline definitions and verify semantic preservation must navigate a highly fragmented ecosystem of metadata formats. This ecosystem ranges from declarative JSON structures and serialized directed acyclic graphs (DAGs) to legacy XML schemas and industry-standard interoperability frameworks.

To programmatically ascertain whether data transforms preserve semantic meaning, an architecture diagnostic tool requires an exhaustive mapping of how various integration platforms represent column-level lineage, data types, and source-to-target dependencies. When semantic meaning is preserved, an identity function effectively maps a source column to a target column without precision loss, domain shift, or cryptographic obfuscation. Conversely, aggregations, conditional splits, and mathematical derivations fundamentally alter the semantic state of the data. This report systematically dissects the metadata architectures of the primary tools dominating the data engineering landscape in 2026, analyzing the precise JSON and XML schemas, the mechanisms for extracting lineage, the available programmatic parsing libraries in the TypeScript/JavaScript ecosystem, and the theoretical implications of parsing static definitions versus runtime operational metadata.

## **1\. dbt (Data Build Tool): Manifest and Catalog Architectures**

The data build tool (dbt) has fundamentally reshaped the ELT paradigm by treating data transformations as software engineering artifacts. By executing SQL-based transformations directly within the target data warehouse, dbt relies on a compilation step that generates comprehensive metadata artifacts. For a diagnostic tool, these artifacts serve as the foundational syntax trees for mapping semantic lineage across the analytical plane.

### **Artifact Structures and Schema Versions**

The manifest.json file contains a complete state representation of a dbt project, encompassing all models, tests, macros, sources, exposures, and their interdependent configurations.1 Because the manifest schema evolves concurrently with dbt Core versions, a diagnostic parser must dynamically identify and adapt to the specific schema version. For instance, dbt Core versions 1.8 through 1.11, as well as the dbt Fusion Engine v2.0, utilize manifest schema version v12 (often denoted internally or identically as v20 in certain fusion contexts).2

The architecture of the manifest.json file contains top-level dictionary keys that a TypeScript diagnostic tool must traverse to construct a macro-level lineage graph. The structure is highly optimized for directed acyclic graph (DAG) generation.

| Manifest Key | Data Structure | Diagnostic Utility for Semantic Parsing |
| :---- | :---- | :---- |
| metadata | Object | Contains the dbt\_schema\_version and adapter type. This dictates the parsing strategy and indicates which SQL dialect the AST parser must utilize.2 |
| nodes | Dictionary | The core collection of all models, tests, seeds, and snapshots. Each node contains a depends\_on array and a columns dictionary containing user-defined metadata.2 |
| sources | Dictionary | Represents raw data inputs. These are essential for identifying the absolute root nodes of the lineage graph from which semantic meaning originates.2 |
| parent\_map | Dictionary | Maps each resource to its immediate upstream dependencies. Used to construct the edges of the macro-level DAG for rapid traversal.2 |
| child\_map | Dictionary | Maps each resource to its immediate downstream dependents, allowing the diagnostic tool to perform forward impact analysis.2 |

While manifest.json defines the transformation logic and project structure, the catalog.json file is generated via the dbt docs generate command and contains physical database metadata extracted directly from the target warehouse's information schema.1 The catalog includes crucial physical data types and row counts, bridging the gap between the logical dbt models and the instantiated warehouse tables. A diagnostic tool must cross-reference the logical data types declared in the manifest's columns dictionary against the physical data types in the catalog to ensure that implicit casting by the database engine has not resulted in semantic truncation or precision loss.

### **Evolution and Representation of Column-Level Lineage**

A pivotal challenge in diagnosing semantic preservation is tracking data at the granular column level rather than the table or model level. In its open-source iterations, dbt Core natively provides robust model-level lineage via the depends\_on.nodes arrays, but column-level lineage (CLL) requires extensive external parsing.5 The depends\_on object lists the upstream models, but it does not specify which column from the upstream model populates a specific column in the downstream model.5

The formal introduction of native column-level lineage capabilities occurred through dbt Cloud and dbt Explorer, which became available for enterprise users to visually and programmatically track end-to-end data provenance at the column level.7 For open-source dbt Core users, or tools building agnostic diagnostics, extracting CLL requires parsing the manifest.json file's compiled\_code (or compiled\_sql in older versions) field using external SQL syntax tree parsers, or relying on integrations with external metadata platforms like DataHub or OpenMetadata.5 OpenMetadata, for example, relies on the compiled\_code field to parse the SQL and deduce which source columns map to which target columns, propagating tags and descriptions accordingly.5

Within the nodes dictionary of the manifest, the columns object contains metadata manually defined in YAML properties, including data types, descriptions, and custom meta fields.4 Diagnostic tools can utilize the meta field to enforce semantic governance, mapping custom tags to column mappings.10 If a column is tagged with a specific semantic domain in the meta dictionary, the diagnostic tool can verify if that domain is maintained in downstream nodes.

### **TypeScript Parsing Ecosystem for dbt**

To programmatically ingest and evaluate these artifacts, the TypeScript library dbt-artifacts-parser-ts provides full type safety and explicit parser implementations for all dbt artifact versions up to v12.3

A diagnostic tool utilizing this library operates by detecting the schema version automatically via metadata.dbt\_schema\_version and returning a strongly typed ParsedManifest object.3 The parsing algorithm for a diagnostic tool would proceed by iterating through the manifest.nodes dictionary. For each node, the tool extracts the depends\_on.nodes array to establish the topological sort order of the DAG. Subsequently, it extracts the compiled\_code string.

To achieve true semantic validation of column mappings, the TypeScript tool must pass the extracted compiled\_code—which contains the raw SQL SELECT statements—to an external Abstract Syntax Tree (AST) SQL parser. Libraries such as dt-sql-parser (built with ANTLR4) or sqlparser-ts (compiled via WebAssembly from Rust) are typically employed alongside the dbt artifact parser.11 By deconstructing the AST, the diagnostic tool can identify whether a target column is an unmodified projection of a source column (preserving semantics), an aggregate function like SUM() (altering row-level semantics), or a conditional CASE statement (creating new semantic branches). The integration of dbt-artifacts-parser-ts for macro-level traversal and sqlparser-ts for micro-level semantic evaluation forms a complete diagnostic engine for the dbt ecosystem.

## **2\. Apache Airflow: Task Dependency and Lineage Metadata**

Unlike dbt, which is a declarative transformation engine strictly operating via SQL, Apache Airflow is an imperative orchestration framework. Airflow schedules and executes arbitrary tasks, meaning the semantic meaning of data transformations is often obfuscated within the execution logic of Python callables, Bash scripts, or external API triggers. Consequently, extracting source-to-target column mappings from Airflow requires intercepting metadata either through its REST API or via dedicated runtime lineage backends.

### **DAG Task Dependencies in Metadata and the REST API**

Airflow represents pipelines as Directed Acyclic Graphs (DAGs). The static representation of a DAG and its operational task dependencies can be accessed through the Airflow REST API, specifically endpoints under /api/v2/.13 The task dependencies are stored as part of the serialized DAG in the Airflow metadata database.14

The /api/v2/dags/{dag\_id}/details endpoint provides the macro-structure of the graph, while Airflow 3.x and newer iterations of the API include endpoints like /assets/{id}/lineage to trace the logical grouping of data.13 However, standard Airflow task dependencies only define operational execution order. They dictate that a specific PostgresOperator must execute before a PythonOperator, but they do not inherently describe the semantic transformation of the data payload moving between those operators. A diagnostic tool parsing native Airflow API responses will only see the orchestration logic, without inherently understanding the data types or column mappings modified within the underlying database.

To circumvent this limitation, the diagnostic tool must analyze the parameters passed to the operators. For instance, parsing the sql parameter of a PostgresOperator or a BigQueryOperator yields the executed query, which can then be fed into an AST parser. However, this approach is brittle when applied to dynamic templating systems like Jinja, which Airflow uses extensively to render queries at runtime.

### **The Airflow Lineage Backend and AIP-60**

To bridge the gap between operational orchestration and data semantics, Airflow introduced a powerful lineage tracking feature that operates via the HookLineageCollector.17 This mechanism allows tasks and hooks to send details about the data assets they interact with to a central hub.17

The metadata format for this lineage collection is governed by Airflow Improvement Proposal 60 (AIP-60), which standardizes the description of assets.17 When a hook interacts with a data store, it registers the input and output assets using asset\_kwargs, capturing metadata keys such as the scheme (e.g., file, postgres) and the path or table name.17

A diagnostic tool can access this collected lineage data by registering a HookLineageReader within an Airflow plugin.17 If no reader is registered, Airflow defaults to a NoOpCollector and discards the lineage metadata entirely.17

| Lineage Component | Function in Airflow Architecture | Extracted Metadata Context |
| :---- | :---- | :---- |
| LineageBackend | A custom backend class configured in airflow.cfg to push lineage metrics to external services.18 | Task parameters, inlets, outlets, and the execution context array.18 |
| HookLineageCollector | A global singleton serving as the central hub for gathering asset interactions precisely at the hook level.17 | scheme, path, connection details, and operation types (read vs. write).17 |
| HookLineageReader | A plugin interface designed to read data collected by the collector from the lineage\_collector.collected\_assets object.17 | AIP-60 compliant asset inputs and outputs structured as discrete logical entities.17 |

### **Standard Metadata Export and OpenLineage Integration**

Because native Airflow metadata provides limited column-level granularity, the industry standard for exporting Airflow pipeline definitions and semantic lineage is the OpenLineage framework. When configured, Airflow's OpenLineage extractors automatically intercept task execution.20 Operators such as the BigQueryOperator, SnowflakeOperator, and PostgresOperator natively emit OpenLineage events upon task completion.20

For a diagnostic tool built in TypeScript, the most effective strategy to parse Airflow definitions is not to parse the DAG Python files directly—as the dynamic generation of tasks precludes static analysis—but rather to configure Airflow to emit OpenLineage JSON events to an HTTP backend. The diagnostic tool can then serve as this backend, ingesting the standardized JSON payloads.20 This transforms the opaque Python orchestration code into a structured JSON graph of inputs, outputs, and transformations, allowing the TypeScript tool to utilize the @openlineage/client library to deserialize the events and evaluate the semantic mappings.

## **3\. Azure Data Factory and Synapse: JSON Pipeline Definitions**

Azure Data Factory (ADF) and Azure Synapse Analytics utilize a visually driven, code-free paradigm that compiles down to extensive, highly structured JSON pipeline definitions. Unlike Airflow, where the transformation logic is buried in imperative scripts, ADF JSON files explicitly define the source-to-target column mappings. This explicit declaration makes them highly amenable to static diagnostic parsing, provided the parser understands the underlying syntax of the mapping properties.

### **Copy Activity Mappings and the Translator Schema**

The ADF Copy Activity facilitates data movement and serialization/deserialization between a source and a sink.21 The core of the column mapping logic resides within the translator property of the JSON schema.22 A diagnostic tool must parse this specific JSON object to verify semantic preservation during data transfers, particularly across heterogeneous systems where data type conversion is mandatory.

The modern translator model utilizes a mappings array, which replaces the legacy columnMappings and schemaMapping objects.22 Within this array, each individual mapping maps a source object to a sink object. The parsing engine must evaluate the following properties to diagnose semantic continuity:

| JSON Property | Data Type | Diagnostic Context and Parsing Usage |
| :---- | :---- | :---- |
| name | String | Specifies the exact column name for tabular-to-tabular mapping (e.g., mapping Id to CustomerID). A change in name implies a potential change in business semantic meaning.22 |
| path | String | Defines a JSON path expression (starting with $) used to extract specific nested fields from hierarchical data (e.g., MongoDB, REST APIs).22 |
| ordinal | Integer | Used for delimited text files lacking headers, mapping columns strictly by their index position.22 |
| type | String | The interim data type recognized by ADF (e.g., Datetime, GUID). This is critical for checking if type-casting alters semantic precision (e.g., casting a float to an integer).22 |
| collectionReference | String | Defined outside the mappings array. Specifies the JSON path of an array to cross-apply, which semantically flattens hierarchical data into multiple tabular rows.22 |

A diagnostic parsing engine in TypeScript can utilize the native JSON.parse() method to read the ADF pipeline JSON, navigate down the object tree to activities.typeProperties.translator.mappings, and programmatically verify the schema alignment. By comparing the source.type against the sink.type, the diagnostic tool can identify precision loss occurring during the automated interim data type conversion process implemented by the Azure integration runtime.22

### **Mapping Data Flows and Data Flow Script (DFS)**

For complex data transformations extending beyond simple data movement, ADF utilizes Mapping Data Flows. Behind the visual interface, these flows are driven by the Data Flow Script (DFS), a proprietary metadata representation similar to a coding language.23 The DFS represents transformations as a continuous stream of connected operations.

A TypeScript diagnostic tool must parse the DFS string, which is typically stored as a single line of collapsed text inside the JSON property, often utilizing escape characters for tabs and newlines.23 The syntax follows a highly specific pattern: \<incoming\_stream\_name\> \<transformation\_type\>(\<properties\>) \~\> \<output\_stream\_name\>.23

Semantic column mapping within DFS occurs heavily in select, derive, and aggregate transformations.23 For example, a derive transformation altering a column's semantic value by casting it to an integer appears in the script as: derive(Rating \= toInteger(Rating)).25

Furthermore, ADF supports dynamic schema drift auto-mapping. A diagnostic tool must identify the presence of allowSchemaDrift: true in the source definition, or the usage of the rule-based mapping syntax mapColumn(each(match(true()))) in a select transformation.23 The presence of these flags indicates to the diagnostic tool that the pipeline definition is polymorphic. In polymorphic pipelines, the exact column mappings cannot be statically determined without knowing the runtime schema of the source dataset, requiring the diagnostic tool to flag the pipeline for runtime evaluation or to infer semantics based on naming pattern rules.

To parse ADF files in the TypeScript/Node.js ecosystem, standard JSON parsers extract the pipeline shell, but custom regular expressions or bespoke AST generators must be built for the DFS syntax. Currently, there are no ubiquitous, heavily maintained open-source parsers exclusively dedicated to compiling DFS syntax trees into TypeScript objects, meaning diagnostic tool developers must write custom tokenizers for strings matching the \<stream\> \<transformation\> \~\> \<output\> pattern.

## **4\. Legacy Enterprise ETL: Informatica, Talend, and SSIS**

Despite the proliferation of cloud-native ELT, large segments of enterprise data architectures still rely on legacy on-premises ETL tools. These systems—SQL Server Integration Services (SSIS), Informatica PowerCenter, and Talend—utilize verbose, proprietary XML schemas. A comprehensive diagnostic tool must be capable of parsing these heavy XML structures to trace historical data lineage and evaluate semantic consistency in legacy pipelines.

### **SSIS:.dtsx Package Formatting**

SSIS packages are saved as .dtsx files, which are highly structured XML documents adhering strictly to Microsoft's Data Transformation Services Package File Format specification.26 The XML schema tracks the complete lifecycle of data through Data Flow Tasks, encompassing sources, transformations, and destinations.27

To extract source-to-target table and column mappings, a TypeScript XML parser such as xml2js, fast-typed-xml, or TypesXML must be employed to traverse the .dtsx hierarchy.28 The XML relies heavily on specific namespaces, most notably www.microsoft.com/SqlServer/Dts, which the parser must properly resolve.31

The lineage mapping within a Data Flow Task is uniquely identified by integer IDs rather than direct string names, creating a highly relational internal structure. A diagnostic tool must map the components by cross-referencing three specific layers of the XML document:

1. **Outputs and Inputs:** The \<outputColumns\> block of a source component contains individual \<outputColumn\> tags, each assigned a specific id, name, and lineageId.32  
2. **External Metadata Linking:** The source column is explicitly linked to the external database schema via the externalMetadataColumnId attribute.32  
3. **Destination Mapping:** The destination component contains \<inputColumns\>, which reference the lineageId of the upstream column, mapping it logically to the destination's own externalMetadataColumnId.33

By programmatically joining these XML nodes on the lineageId attribute, the diagnostic tool can reconstruct the exact semantic path of a column through an SSIS package.33 If the lineageId passes through a Derived Column transformation, the parser must extract the mathematical expression encoded within the component's properties to determine if the semantic meaning was fundamentally altered.

### **Informatica PowerCenter: powrmart.dtd**

Informatica PowerCenter facilitates metadata exchange through XML files that conform to the proprietary powrmart.dtd Document Type Definition.34 Informatica utilizes "Transformations," classified as either Active or Passive, to modify data logic.36 Active transformations can change the number of rows passing through them (altering aggregate semantics), while passive transformations maintain the row count.

The exported XML files explicitly define the transformations, mapping source fields to target fields. To parse an Informatica XML file, the TypeScript diagnostic tool must utilize an XML parser configured to handle DTD validation (or to ignore the powrmart.dtd DOCTYPE declaration if offline parsing is required).35 The parser must locate the \<MAPPING\> tags.37 Within these mappings, \<TRANSFORMATION\> nodes represent the various ETL steps, such as Source Qualifier, Expression, and Target.37

The critical data structure for column lineage is the \<TRANSFORMFIELD\> element, which contains properties such as DATATYPE, NAME, PORTTYPE (INPUT/OUTPUT), and most importantly, EXPRESSION.37 If an expression contains string manipulation or mathematical aggregation (e.g., EXPRESSION="SYSTIMESTAMP()"), the diagnostic tool can flag this field as a point of semantic transformation where the data meaning is fundamentally generated or altered.37 The mapping logic traces a direct path from the \<SOURCEFIELD\> to the intermediate \<TRANSFORMFIELD\> and finally terminates at the \<TARGETFIELD\>.40

### **Talend:.item File Architecture**

Talend Open Studio and Talend Data Integration store their graphical job designs in XML files with the .item extension.42 The architecture of a Talend job is defined by a sequence of interconnected nodes, representing components like tFileInputDelimited or tMap.

In the .item XML, each component is represented as a \<node\>, containing numerous \<elementParameter\> tags that define its precise configuration. The semantic column mapping is predominantly handled by the tMap component, which functions as the primary transformation engine. Within the XML, the tMap node contains a \<nodeData\> block utilizing an internal XML representation that defines \<mapperTableEntries\> for both input and output tables.

A TypeScript diagnostic tool must extract the \<mapperTableEntries\> from the input table and match them against the expression attributes found in the output table's \<mapperTableEntries\>. By parsing these expressions, the tool maps the exact transformation logic applied between the source and the target flow, evaluating if operations like string concatenation or type parsing have preserved the original data semantics.

### **The Evolution of Standard Interchange Formats**

Historically, the industry attempted to unify these disparate XML formats under the Common Warehouse Metamodel (CWM), a specification released by the Object Management Group (OMG) based on UML and XML Metadata Interchange (XMI).44 CWM provided standardized interfaces for tracking data lineage and transformation rules across distributed heterogeneous environments.45

However, despite early support from vendors like IBM and Oracle, CWM proved excessively complex, heavyweight, and severely misaligned with the rapid rise of cloud-native, JSON-driven architectures. The strict UML modeling requirements created massive friction for rapid pipeline development. Consequently, CWM has largely been deprecated in modern data stacks in favor of API-first standards, culminating in the rise of OpenLineage as the definitive, lightweight interchange format for the 2026 data landscape.47

## **5\. The Ubiquitous CSV: Simple Source-to-Target Mapping Templates**

Despite the sophistication of automated parsers and graphical ETL tools, a significant portion of enterprise semantic mapping begins its lifecycle in human-readable Source-to-Target Mapping (STM) documents, typically formatted as Excel or CSV files.50 Data architects use these files during the design phase to explicitly define how legacy systems map to modern data warehouses. A comprehensive diagnostic tool must be capable of parsing these static files to establish the "intended" baseline semantic logic, which is subsequently compared against the actual automated pipeline definitions to detect implementation drift.

### **Anatomy of STM Templates**

While there is no rigid global standard enforced by a governing body, industry-standard STM CSV files generally adhere to a widely recognized column structure designed to capture origin, destination, and the semantic delta between them.51 A diagnostic tool designed to ingest architectural intent expects to parse a CSV with the following fundamental schema:

| Common CSV Header | Description | Diagnostic Parsing Rule |
| :---- | :---- | :---- |
| Source\_System / Source\_Table | The origin database and table structure.50 | Defines the root node of the theoretical lineage graph. |
| Source\_Column | The specific origin field within the source system.52 | Defines the incoming edge of the transformation logic. |
| Target\_Table | The destination object in the data warehouse.52 | Defines the terminal node for the current operation. |
| Target\_Column | The destination field.52 | Defines the specific state of the data post-transformation. |
| Transformation\_Logic / Rule | SQL snippets, pseudocode, or explicit business rules (e.g., getdate(), LEFT JOIN).52 | The semantic delta. Parsed via NLP or SQL parsers to identify logic like filtering, casting, or aggregation. |
| Data\_Type | Expected target data type.50 | Validated against the source to detect intended precision loss or semantic truncation. |

When a diagnostic tool parses these CSVs using standard Node.js streaming CSV parsers, it essentially creates a deterministic, intended graph model in memory. The tool specifically evaluates the Transformation\_Logic column to determine if the architectural mapping dictates a direct 1:1 pass-through (an identity transform) or a complex derivation.

Complex derivations embedded in the CSV (such as SELECT \* FROM SourceFile1 A LEFT JOIN SourceFile2 B) indicate that semantic meaning is derived from multiple inputs, prompting the diagnostic tool to flag the target column as a heavily transformed, high-risk asset requiring strict data quality assertions.53 By parsing the intended CSV mapping alongside the actual pipeline execution definitions (like dbt manifest files or ADF JSONs), the diagnostic engine can computationally identify deviations between architectural intent and engineering reality, flagging instances where a developer's code altered the semantic meaning approved by the architect.

## **6\. The OpenLineage Standard: Unifying Column-Level Lineage**

As of 2025 and moving deeply into 2026, the data engineering industry has largely coalesced around OpenLineage as the open, universal standard for metadata and lineage collection.47 Rather than forcing a diagnostic tool to independently build and maintain custom parsers for the proprietary formats of dbt, Airflow, Spark, and ADF, these modern computation engines are increasingly configured to natively emit OpenLineage events during execution.54

By standardizing the output into a single specification, OpenLineage solves the classical "N-squared" integration problem, allowing a single diagnostic tool to understand any pipeline by listening to a unified JSON schema.54 The effort of integration is shared across the open-source community, ensuring that as new data tools emerge, they simply adopt the OpenLineage emission standard rather than requiring downstream diagnostic tools to learn new syntax.54

### **The ColumnLineageDatasetFacet Specification**

The core capability enabling programmatic semantic preservation checks is the ColumnLineageDatasetFacet.59 This facet extends the standard OpenLineage run state update to provide fine-grained telemetry on how specific input columns contribute to output columns.59

Within the JSON payload of an OpenLineage event, the facets object of an output dataset contains the columnLineage schema. The structure is highly optimized for semantic traceability and computational analysis:

1. **fields Object:** The top-level keys within the fields object represent the exact names of the output columns generated by the pipeline.59  
2. **inputFields Array:** For every output column, this array lists all the source columns that influenced its creation, explicitly specifying the source dataset's namespace, name, and field.59  
3. **transformations Array:** This is the most critical element for verifying semantic preservation. It details precisely *how* the input relates to the output mathematically and logically.59

The transformations object categorizes the semantic shift using two primary indicators that a diagnostic parser utilizes to determine semantic drift:

* **type:** Categorized as either DIRECT (the output is mathematically derived from the input) or INDIRECT (the input influenced the output via a WHERE clause, JOIN condition, or ORDER BY sorting, but its raw value is not actually present in the output column).59  
* **subtype:** Provides exact semantic context. For DIRECT types, subtypes include IDENTITY (perfect semantic preservation, exact 1:1 pass-through), TRANSFORMATION (data was altered, e.g., mathematically modified or substring extraction), or AGGREGATION (data was summarized from multiple rows into one).59 For INDIRECT types, subtypes include JOIN, FILTER, GROUP\_BY, or CONDITIONAL (e.g., CASE statements).59  
* **masking:** A boolean flag that alerts the diagnostic tool if the data was obfuscated or hashed, representing an intentional destruction of the original semantic meaning for security or compliance purposes.59

Furthermore, modern implementations of the standard utilize a dataset-level field to represent indirect relationships that impact the entire output. This avoids the computational inefficiency of duplicating indirect lineage metrics across every single output column's array, which in legacy implementations created a massive cartesian product of metadata.59

### **Parsing OpenLineage in TypeScript**

For a diagnostic tool built in the TypeScript ecosystem, parsing and interacting with this standardized schema is straightforward and highly typed. The official @openlineage/client package provides a robust TypeScript/JavaScript client designed explicitly for creating, validating, and parsing OpenLineage standard events against the official spec.61

When the diagnostic tool ingests an OpenLineage JSON event, it can strictly type the payload against the OpenLineage OpenAPI specification.54 By isolating the ColumnLineageDatasetFacet, the diagnostic tool can rapidly audit complex pipelines without parsing a single line of raw SQL or XML.

The algorithmic approach is highly deterministic. For example, if a financial compliance rule dictates that a specific column (e.g., Account\_Balance) must maintain its exact semantic meaning through a multi-stage pipeline, the diagnostic tool queries the OpenLineage graph using the TypeScript client. It traverses the fields object to locate Account\_Balance. It then iterates through the transformations array. If the subtype of the transformation is anything other than IDENTITY, or if the masking flag evaluates to true, the tool programmatically flags the pipeline for a semantic preservation violation, effectively ensuring architectural integrity through automated metadata analysis.

## **Conclusion**

Building a robust data architecture diagnostic tool requires bridging the immense gap between declarative architectural intent, operational execution orchestration, and disparate proprietary schemas. The analysis demonstrates a distinct evolutionary trajectory in how semantic transformations are documented and parsed. Legacy enterprise systems like SSIS, Talend, and Informatica rely on static, tightly coupled XML structures (.dtsx, .item, and powrmart.dtd) where semantic logic is deeply nested within proprietary UI configurations. Cloud-first platforms like Azure Data Factory shifted this paradigm to JSON-based explicit mapping arrays (translator) and domain-specific scripting languages (Data Flow Script). Code-first engines like dbt generate massive, dynamic JSON artifacts (manifest.json), pushing the burden of column-level semantic parsing onto external AST SQL analyzers.

However, the future of diagnostic parsing lies in runtime observability frameworks rather than static file analysis. The rapid, widespread adoption of the OpenLineage standard in 2025 and 2026 provides a unified, highly typed JSON schema (ColumnLineageDatasetFacet) that precisely categorizes the semantic nature of transformations (DIRECT, INDIRECT, IDENTITY, AGGREGATION). By leveraging robust TypeScript libraries to parse dbt artifacts and OpenLineage events, an architecture diagnostic tool can move beyond merely mapping where data flows computationally. Instead, it can mathematically and logically verify that the semantic integrity of the data remains flawlessly intact across the entire expanse of the enterprise ecosystem.

#### **Works cited**

1. dbt Artifacts: a full guide \- Elementary Data, accessed February 27, 2026, [https://www.elementary-data.com/post/dbt-artifacts-a-full-guide](https://www.elementary-data.com/post/dbt-artifacts-a-full-guide)  
2. Manifest JSON file | dbt Developer Hub, accessed February 27, 2026, [https://docs.getdbt.com/reference/artifacts/manifest-json](https://docs.getdbt.com/reference/artifacts/manifest-json)  
3. GitHub \- yu-iskw/dbt-artifacts-parser-ts, accessed February 27, 2026, [https://github.com/yu-iskw/dbt-artifacts-parser-ts](https://github.com/yu-iskw/dbt-artifacts-parser-ts)  
4. About documentation | dbt Developer Hub, accessed February 27, 2026, [https://docs.getdbt.com/docs/build/documentation](https://docs.getdbt.com/docs/build/documentation)  
5. Ingest Lineage from dbt | Official Documentation, accessed February 27, 2026, [https://docs.open-metadata.org/v1.11.x/connectors/database/dbt/ingest-dbt-lineage](https://docs.open-metadata.org/v1.11.x/connectors/database/dbt/ingest-dbt-lineage)  
6. dbt Workflow | OpenMetadata Data Build Tool Integration, accessed February 27, 2026, [https://docs.open-metadata.org/latest/connectors/ingestion/workflows/dbt](https://docs.open-metadata.org/latest/connectors/ingestion/workflows/dbt)  
7. Column-level lineage | dbt Developer Hub, accessed February 27, 2026, [https://docs.getdbt.com/docs/explore/column-level-lineage](https://docs.getdbt.com/docs/explore/column-level-lineage)  
8. dbt Core vs dbt Cloud – Key Differences as of 2025 \- Datacoves, accessed February 27, 2026, [https://datacoves.com/post/dbt-core-key-differences](https://datacoves.com/post/dbt-core-key-differences)  
9. meta | dbt Developer Hub, accessed February 27, 2026, [https://docs.getdbt.com/reference/resource-configs/meta](https://docs.getdbt.com/reference/resource-configs/meta)  
10. dbt \- DataHub, accessed February 27, 2026, [https://docs.datahub.com/docs/generated/ingestion/sources/dbt](https://docs.datahub.com/docs/generated/ingestion/sources/dbt)  
11. DTStack/dt-sql-parser: SQL Parsers for BigData, built with antlr4. \- GitHub, accessed February 27, 2026, [https://github.com/DTStack/dt-sql-parser](https://github.com/DTStack/dt-sql-parser)  
12. guan404ming/sqlparser-ts: SQL parser for JavaScript and TypeScript \- GitHub, accessed February 27, 2026, [https://github.com/guan404ming/sqlparser-ts](https://github.com/guan404ming/sqlparser-ts)  
13. Airflow REST API, accessed February 27, 2026, [https://airflow.apache.org/docs/apache-airflow/3.1.7/stable-rest-api-ref.html](https://airflow.apache.org/docs/apache-airflow/3.1.7/stable-rest-api-ref.html)  
14. Is there a way to obtain related data about DAG dependencies? · apache airflow · Discussion \#34389 \- GitHub, accessed February 27, 2026, [https://github.com/apache/airflow/discussions/34389](https://github.com/apache/airflow/discussions/34389)  
15. Airflow REST API \- Apache Airflow, accessed February 27, 2026, [https://airflow.apache.org/docs/apache-airflow/2.3.4/stable-rest-api-ref.html](https://airflow.apache.org/docs/apache-airflow/2.3.4/stable-rest-api-ref.html)  
16. Asset Definitions — Airflow 3.1.7 Documentation \- Apache Airflow, accessed February 27, 2026, [https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/assets.html](https://airflow.apache.org/docs/apache-airflow/stable/authoring-and-scheduling/assets.html)  
17. Lineage — Airflow 3.1.7 Documentation \- Apache Airflow, accessed February 27, 2026, [https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/lineage.html](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/lineage.html)  
18. Lineage — Airflow Documentation, accessed February 27, 2026, [https://airflow.apache.org/docs/apache-airflow/2.4.3/lineage.html](https://airflow.apache.org/docs/apache-airflow/2.4.3/lineage.html)  
19. Airflow Lineage Backend | Official Documentation, accessed February 27, 2026, [https://docs.getcollate.io/connectors/pipeline/airflow/lineage-backend?\_\_hstc=76629258.73bd3bee6fa385653ecd7c9674ba06f0.1735603200247.1735603200248.1735603200249.1&\_\_hssc=76629258.1.1735603200250&\_\_hsfp=38884120](https://docs.getcollate.io/connectors/pipeline/airflow/lineage-backend?__hstc=76629258.73bd3bee6fa385653ecd7c9674ba06f0.1735603200247.1735603200248.1735603200249.1&__hssc=76629258.1.1735603200250&__hsfp=38884120)  
20. 3 Ways to Extract Data Lineage with Airflow \- Astronomer, accessed February 27, 2026, [https://www.astronomer.io/blog/3-ways-to-extract-data-lineage-from-airflow/](https://www.astronomer.io/blog/3-ways-to-extract-data-lineage-from-airflow/)  
21. Copy activity \- Azure Data Factory & Azure Synapse | Microsoft Learn, accessed February 27, 2026, [https://learn.microsoft.com/en-us/azure/data-factory/copy-activity-overview](https://learn.microsoft.com/en-us/azure/data-factory/copy-activity-overview)  
22. Schema and data type mapping in copy activity \- Azure Data Factory & Azure Synapse, accessed February 27, 2026, [https://learn.microsoft.com/en-us/azure/data-factory/copy-activity-schema-and-type-mapping](https://learn.microsoft.com/en-us/azure/data-factory/copy-activity-schema-and-type-mapping)  
23. Mapping data flow script \- Azure Data Factory | Microsoft Learn, accessed February 27, 2026, [https://learn.microsoft.com/en-us/azure/data-factory/data-flow-script](https://learn.microsoft.com/en-us/azure/data-factory/data-flow-script)  
24. Aggregate transformation in mapping data flow \- Azure Data Factory & Azure Synapse, accessed February 27, 2026, [https://learn.microsoft.com/en-us/azure/data-factory/data-flow-aggregate](https://learn.microsoft.com/en-us/azure/data-factory/data-flow-aggregate)  
25. Derived column transformation in mapping data flows \- Azure Data Factory & Azure Synapse, accessed February 27, 2026, [https://learn.microsoft.com/en-us/azure/data-factory/data-flow-derived-column](https://learn.microsoft.com/en-us/azure/data-factory/data-flow-derived-column)  
26. \[MS-DTSX\]: Data Transformation Services Package XML File Format ..., accessed February 27, 2026, [https://learn.microsoft.com/en-us/openspecs/sql\_data\_portability/ms-dtsx/235600e9-0c13-4b5b-a388-aa3c65aec1dd](https://learn.microsoft.com/en-us/openspecs/sql_data_portability/ms-dtsx/235600e9-0c13-4b5b-a388-aa3c65aec1dd)  
27. Data Flow \- SQL Server Integration Services (SSIS) | Microsoft Learn, accessed February 27, 2026, [https://learn.microsoft.com/en-us/sql/integration-services/data-flow/data-flow?view=sql-server-ver17](https://learn.microsoft.com/en-us/sql/integration-services/data-flow/data-flow?view=sql-server-ver17)  
28. Parsing and Manipulating XML Files Using TypeScript | CodeSignal Learn, accessed February 27, 2026, [https://codesignal.com/learn/courses/hierarchical-and-structured-data-formats-in-ts/lessons/parsing-and-manipulating-xml-files-using-typescript](https://codesignal.com/learn/courses/hierarchical-and-structured-data-formats-in-ts/lessons/parsing-and-manipulating-xml-files-using-typescript)  
29. sya-ri/fast-typed-xml: A high-performance, schema-based XML parser for TypeScript with strong type safety. \- GitHub, accessed February 27, 2026, [https://github.com/sya-ri/fast-typed-xml](https://github.com/sya-ri/fast-typed-xml)  
30. rmraya/TypesXML: TypeScript XML Library and Processing Toolkit \- GitHub, accessed February 27, 2026, [https://github.com/rmraya/TypesXML](https://github.com/rmraya/TypesXML)  
31. Get an XML Element value from a DTSX File Using an XML Parser \- Stack Overflow, accessed February 27, 2026, [https://stackoverflow.com/questions/43667823/get-an-xml-element-value-from-a-dtsx-file-using-an-xml-parser](https://stackoverflow.com/questions/43667823/get-an-xml-element-value-from-a-dtsx-file-using-an-xml-parser)  
32. SSIS-Tutorial/Lesson 1.dtsx at master \- GitHub, accessed February 27, 2026, [https://github.com/LearningTechStuff/SSIS-Tutorial/blob/master/Lesson%201.dtsx](https://github.com/LearningTechStuff/SSIS-Tutorial/blob/master/Lesson%201.dtsx)  
33. Parse SSIS .xml source to retrieve table mappings \- Stack Overflow, accessed February 27, 2026, [https://stackoverflow.com/questions/29513566/parse-ssis-xml-source-to-retrieve-table-mappings](https://stackoverflow.com/questions/29513566/parse-ssis-xml-source-to-retrieve-table-mappings)  
34. Exchanging Metadata Overview \- Informatica Documentation, accessed February 27, 2026, [https://docs.informatica.com/data-integration/powercenter/10-5/repository-guide/exchanging-metadata/exchanging-metadata-overview.html](https://docs.informatica.com/data-integration/powercenter/10-5/repository-guide/exchanging-metadata/exchanging-metadata-overview.html)  
35. FAQ: How to read Mapping XML as a source using Hierarchical parser or ISM model in CDI?, accessed February 27, 2026, [https://knowledge.informatica.com/s/article/000210864?language=en\_US](https://knowledge.informatica.com/s/article/000210864?language=en_US)  
36. XML Transformation in Informatica \- Perficient Blogs, accessed February 27, 2026, [https://blogs.perficient.com/2018/07/19/xml-transformation-in-informatica/](https://blogs.perficient.com/2018/07/19/xml-transformation-in-informatica/)  
37. A quick way of generating Informatica PowerCenter Mappings from a template, accessed February 27, 2026, [https://www.rittmanmead.com/blog/2022/05/a-quick-way-of-generating-informatica-powercenter-mappings-from-a-template/](https://www.rittmanmead.com/blog/2022/05/a-quick-way-of-generating-informatica-powercenter-mappings-from-a-template/)  
38. Rittman Mead Consulting | Oracle FAQ, accessed February 27, 2026, [https://www.orafaq.com/aggregator/sources/14](https://www.orafaq.com/aggregator/sources/14)  
39. PowerCenter \- Simple staging example \- CrossGenerate \- CrossBreeze, accessed February 27, 2026, [https://generate.crossbreeze.nl/docs/2.0/Examples/Informatica\_PowerCenter/Simple\_staging/](https://generate.crossbreeze.nl/docs/2.0/Examples/Informatica_PowerCenter/Simple_staging/)  
40. PowerCenter 8.1.1 Troubleshooting Guide \- WordPress.com, accessed February 27, 2026, [https://raghukalvakota.files.wordpress.com/2013/12/pc\_811\_troubleshootingguide1.pdf](https://raghukalvakota.files.wordpress.com/2013/12/pc_811_troubleshootingguide1.pdf)  
41. Message Reference \- Informatica, accessed February 27, 2026, [https://docs-test.informatica.com/content/dam/source/GUID-8/GUID-8A305148-1A65-48DE-88ED-82F9DB2AE287/36/en/IN\_1054\_MessageReference\_en.pdf](https://docs-test.informatica.com/content/dam/source/GUID-8/GUID-8A305148-1A65-48DE-88ED-82F9DB2AE287/36/en/IN_1054_MessageReference_en.pdf)  
42. Exporting items | Talend Studio Help, accessed February 27, 2026, [https://help.talend.com/r/en-US/8.0/studio-user-guide/exporting-items](https://help.talend.com/r/en-US/8.0/studio-user-guide/exporting-items)  
43. Talend Component Documentation, accessed February 27, 2026, [https://talend.github.io/component-runtime/main/0.0.13/documentation.html](https://talend.github.io/component-runtime/main/0.0.13/documentation.html)  
44. About the Common Warehouse Metamodel Specification Version 1.1, accessed February 27, 2026, [https://www.omg.org/spec/CWM/1.1/About-CWM](https://www.omg.org/spec/CWM/1.1/About-CWM)  
45. Common warehouse metamodel \- Wikipedia, accessed February 27, 2026, [https://en.wikipedia.org/wiki/Common\_warehouse\_metamodel](https://en.wikipedia.org/wiki/Common_warehouse_metamodel)  
46. Metadata Standards for Data Warehousing: Open Information Model vs. Common Warehouse Metamodel. \- ResearchGate, accessed February 27, 2026, [https://www.researchgate.net/publication/220415821\_Metadata\_Standards\_for\_Data\_Warehousing\_Open\_Information\_Model\_vs\_Common\_Warehouse\_Metamodel](https://www.researchgate.net/publication/220415821_Metadata_Standards_for_Data_Warehousing_Open_Information_Model_vs_Common_Warehouse_Metamodel)  
47. Why an Open Standard for Lineage Metadata? \- OpenLineage, accessed February 27, 2026, [https://openlineage.io/blog/why-open-standard/](https://openlineage.io/blog/why-open-standard/)  
48. OpenMetadata vs. OpenLineage: Primary Capabilities, Architecture & More \- Atlan, accessed February 27, 2026, [https://atlan.com/openmetadata-vs-openlineage/](https://atlan.com/openmetadata-vs-openlineage/)  
49. 9 Best Data Lineage Tools in 2026 \- Atlan, accessed February 27, 2026, [https://atlan.com/data-lineage-tools/](https://atlan.com/data-lineage-tools/)  
50. Source to target mapping using Excel | Blog \- Future Processing, accessed February 27, 2026, [https://www.future-processing.com/blog/source-to-target-mapping-using-excel/](https://www.future-processing.com/blog/source-to-target-mapping-using-excel/)  
51. Source-to-Target Data Mapping: All You Need to Know, accessed February 27, 2026, [https://dataintegrationinfo.com/source-to-target-data-mapping/](https://dataintegrationinfo.com/source-to-target-data-mapping/)  
52. CSV file format to import mappings in extension mapping documents \- IBM, accessed February 27, 2026, [https://www.ibm.com/docs/en/iis/11.7?topic=iemdtm-csv-file-format-import-mappings-in-extension-mapping-documents](https://www.ibm.com/docs/en/iis/11.7?topic=iemdtm-csv-file-format-import-mappings-in-extension-mapping-documents)  
53. How to implement Source to Target ETL Mapping sheet in PySpark using Delta tables \- Databricks Community, accessed February 27, 2026, [https://community.databricks.com/t5/data-engineering/how-to-implement-source-to-target-etl-mapping-sheet-in-pyspark/td-p/32770](https://community.databricks.com/t5/data-engineering/how-to-implement-source-to-target-etl-mapping-sheet-in-pyspark/td-p/32770)  
54. OpenLineage/OpenLineage: An Open Standard for lineage metadata collection \- GitHub, accessed February 27, 2026, [https://github.com/OpenLineage/OpenLineage](https://github.com/OpenLineage/OpenLineage)  
55. From ETL to Autonomy: Data Engineering in 2026 \- The New Stack, accessed February 27, 2026, [https://thenewstack.io/from-etl-to-autonomy-data-engineering-in-2026/](https://thenewstack.io/from-etl-to-autonomy-data-engineering-in-2026/)  
56. dbt \- OpenLineage, accessed February 27, 2026, [https://openlineage.io/docs/integrations/dbt/](https://openlineage.io/docs/integrations/dbt/)  
57. Capture data lineage from dbt, Apache Airflow, and Apache Spark with Amazon SageMaker, accessed February 27, 2026, [https://aws.amazon.com/blogs/big-data/capture-data-lineage-from-dbt-apache-airflow-and-apache-spark-with-amazon-sagemaker/](https://aws.amazon.com/blogs/big-data/capture-data-lineage-from-dbt-apache-airflow-and-apache-spark-with-amazon-sagemaker/)  
58. Data Lineage with Openlineage \- Medium, accessed February 27, 2026, [https://medium.com/@manideepgrandhi02/data-lineage-with-openlineage-8cd095f9eb4e](https://medium.com/@manideepgrandhi02/data-lineage-with-openlineage-8cd095f9eb4e)  
59. Column Level Lineage Dataset Facet | OpenLineage, accessed February 27, 2026, [https://openlineage.io/docs/1.44.0/spec/facets/dataset-facets/column\_lineage\_facet](https://openlineage.io/docs/1.44.0/spec/facets/dataset-facets/column_lineage_facet)  
60. Column-Level Lineage \- OpenLineage, accessed February 27, 2026, [https://openlineage.io/docs/integrations/spark/spark\_column\_lineage/](https://openlineage.io/docs/integrations/spark/spark_column_lineage/)  
61. keywords:lineage \- npm search, accessed February 27, 2026, [https://www.npmjs.com/search?q=keywords:lineage](https://www.npmjs.com/search?q=keywords:lineage)  
62. OpenLineage: Home, accessed February 27, 2026, [https://openlineage.io/](https://openlineage.io/)