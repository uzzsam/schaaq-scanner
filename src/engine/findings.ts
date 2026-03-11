/**
 * DALC v4 Engine — Findings Dataset
 * Engine codename: Archimedes
 *
 * All 24 findings (8 per sector x 3 sectors) from Blueprint section 3.
 * Each finding includes cost function, category weights, DAMA-DMBOK refs,
 * sector standards, remediation text, and Phase 2 scanner check description.
 */

import type { DALCInput, FindingDefinition, Sector } from './types';

// ---------------------------------------------------------------------------
// All 24 Findings
// ---------------------------------------------------------------------------

export const FINDINGS: FindingDefinition[] = [
  // =========================================================================
  // Property 1: Semantic Identity Layer
  // =========================================================================
  {
    id: 'P1-M',
    propertyId: 'semanticIdentity',
    sector: 'mining',
    title: 'Inconsistent Entity Definitions Across Systems',
    description:
      'Same entity (site/bore/well/location/hole_id) defined differently across geological, mine planning, fleet, and environmental systems.',
    example:
      'Geology calls it "DH-2014-087", mine planning calls it "DrillHole_087", fleet uses "Site_Alpha_BH87", environmental uses "Bore_ID:2014/87". No authoritative master.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management',
    sectorStandard: 'EarthResourceML MineralOccurrence/Mine; OSDU entity model',
    categoryWeights: {
      firefighting: 0.3,
      dataQuality: 0.3,
      integration: 0.2,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 52_000 * input.sourceSystems,
    remediation:
      'Implement a narrow entity register (not a mega-model) conforming to EarthResourceML entity definitions. Each source system maps to the register via adapters. New systems onboard by mapping to the register.',
    scannerCheck:
      'Count distinct entity name patterns for equivalent real-world objects across connected databases; flag where >1 definition exists for same entity.',
  },
  {
    id: 'P1-E',
    propertyId: 'semanticIdentity',
    sector: 'environmental',
    title: 'Inconsistent Entity Definitions Across ESG Systems',
    description:
      'Facility, site, plant, and operation defined inconsistently across ESG platforms, operational systems, and reporting tools. Regulators treat entity mismatches as evidence of unreliable data governance — triggering audits, restatements, and enforcement action.',
    example:
      'Carbon accounting uses "Melbourne_HQ", energy billing uses "Site_MEL_001", HR uses "VIC_Office_Main". The CSRD report needs them reconciled. When they can\'t be, the auditor qualifies the report and regulatory exposure begins.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management',
    sectorStandard: 'ODM2 SamplingFeature; ESRS XBRL entity identifiers',
    categoryWeights: {
      firefighting: 0.2,
      dataQuality: 0.3,
      integration: 0.2,
      productivity: 0,
      regulatory: 0.3,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 48_000 * input.sourceSystems,
    remediation:
      'Implement facility register aligned with ESRS entity taxonomy. Map operational systems to a single facility identifier. Critical for CSRD Scope 1/2/3 boundary definitions — without this, regulatory reporting is structurally unreliable.',
    scannerCheck:
      'Compare entity names and identifiers across sustainability data platforms; detect semantic duplicates via fuzzy matching that expose data governance risk.',
  },
  {
    id: 'P1-U',
    propertyId: 'semanticIdentity',
    sector: 'energy',
    title: 'Inconsistent Asset Identification Across Grid Systems',
    description:
      'Same physical asset identified differently across SCADA, GIS, SAP, and AEMO market systems.',
    example:
      'Transformer is "T-4021" in SCADA, "TRF_4021" in GIS, "Asset#40210" in SAP, and "DUID_TF4021" in AEMO dispatch.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management',
    sectorStandard:
      'CIM IdentifiedObject (IEC 61970); IEC 61850 Logical Nodes',
    categoryWeights: {
      firefighting: 0.3,
      dataQuality: 0.2,
      integration: 0.3,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 65_000 * input.sourceSystems,
    remediation:
      'Implement asset identity register conforming to CIM IdentifiedObject. Map SCADA, GIS, EAM, and market systems to common asset identifiers. CIM\u2019s 39+ TSO adoption via CGMES validates the pattern.',
    scannerCheck:
      'Cross-reference asset IDs between connected systems; flag where naming patterns diverge for same physical equipment.',
  },

  // =========================================================================
  // Property 2: Controlled Reference Data
  // =========================================================================
  {
    id: 'P2-M',
    propertyId: 'controlledReference',
    sector: 'mining',
    title: 'Inconsistent Units and Classification Codes',
    description:
      'Different units of measure, JORC classification codes, and lookup values across geological, processing, and reporting systems.',
    example:
      'Grade reported as "ppm" in lab results, "g/t" in resource estimates, "%" in mine plans. JORC categories applied inconsistently between geologists.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management; KA11 \u2014 Data Quality',
    sectorStandard:
      'GeoSciML controlled vocabularies; JORC Code 2012 classification definitions',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0.4,
      integration: 0.2,
      productivity: 0.3,
      regulatory: 0.1,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 38_000 * input.sourceSystems,
    remediation:
      'Implement central vocabulary service aligned with GeoSciML vocabularies and JORC classification codes. All systems reference shared controlled lists with versioned updates.',
    scannerCheck:
      'Extract unit-of-measure columns across databases; detect inconsistent representations of equivalent quantities.',
  },
  {
    id: 'P2-E',
    propertyId: 'controlledReference',
    sector: 'environmental',
    title: 'Competing Framework Reference Data',
    description:
      'Emission factors, classification codes, and unit definitions differ between GRI, ISSB, ESRS, and internal systems. Inconsistent reference data means reported numbers cannot withstand audit scrutiny — the data architecture, not the environmental performance, is the failure point.',
    example:
      'Scope 2 emission factor for grid electricity: CSRD requires location-based AND market-based. Internal system has only one. GRI requires a different boundary definition. Auditor flags the discrepancy; board learns the compliance gap costs more than the remediation.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management; KA11 \u2014 Data Quality',
    sectorStandard:
      'GHG Protocol emission factors; ESRS XBRL taxonomy; QUDT ontology',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0.3,
      integration: 0.2,
      productivity: 0.3,
      regulatory: 0.2,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 44_000 * input.sourceSystems,
    remediation:
      'Implement multi-framework reference data service supporting ESRS, GRI, and ISSB classification codes simultaneously. Version emission factors by reporting year. Eliminates audit qualification risk from reference data inconsistency.',
    scannerCheck:
      'Compare emission factor tables across platforms; flag version mismatches and missing framework mappings that create regulatory compliance exposure.',
  },
  {
    id: 'P2-U',
    propertyId: 'controlledReference',
    sector: 'energy',
    title: 'Metering Data Inconsistency',
    description:
      'Smart meter data, SCADA readings, and billing system values use different units, temporal resolutions, and quality codes.',
    example:
      'Smart meter reports kWh at 30-minute intervals, SCADA reports MW at 5-second intervals, billing system stores monthly totals in different units.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management; KA11 \u2014 Data Quality',
    sectorStandard:
      'CIM measurement types; IEC 61850 data objects; AEMO 5-minute settlement specification',
    categoryWeights: {
      firefighting: 0.2,
      dataQuality: 0.4,
      integration: 0.2,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 55_000 * input.sourceSystems,
    remediation:
      'Implement CIM-aligned measurement type registry. Standardise temporal aggregation rules per AEMO 5MS requirements. Define authoritative resolution and quality codes.',
    scannerCheck:
      'Compare measurement units and temporal resolutions across metering databases; flag inconsistent aggregation rules.',
  },

  // =========================================================================
  // Property 3: Domain-Owned Data with Bounded Contexts
  // =========================================================================
  {
    id: 'P3-M',
    propertyId: 'domainOwnership',
    sector: 'mining',
    title: 'No Clear Ownership of Cross-Domain Entities',
    description:
      'Geology, mine planning, fleet management, and environmental monitoring all maintain overlapping but incompatible views of shared entities (drill holes, pits, stockpiles) with no agreed owner.',
    example:
      'Who owns the "current pit shell" definition \u2014 geology (resource model), mine planning (schedule), or survey (actual)? Each has a different version. Nobody is authoritative.',
    damaDmbok: 'KA2 \u2014 Data Architecture; KA3 \u2014 Data Modeling & Design',
    sectorStandard:
      'Mining domain separation pattern (geology \u2192 planning \u2192 execution \u2192 monitoring lifecycle)',
    categoryWeights: {
      firefighting: 0.3,
      dataQuality: 0.2,
      integration: 0.3,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      45_000 * input.sourceSystems * 0.5,
    remediation:
      'Establish domain ownership model: each domain owns its model and evolves it independently, connected to shared entities via the identity register (Property 1).',
    scannerCheck:
      'Detect overlapping entity definitions across domain schemas; flag where same concept appears in multiple databases without declared ownership.',
  },
  {
    id: 'P3-E',
    propertyId: 'domainOwnership',
    sector: 'environmental',
    title: 'Scope 3 Data Has No Single Owner',
    description:
      'Scope 3 supplier data spans procurement, sustainability, operations, and finance with no single methodology or ownership model. Unowned data creates unquantified business risk \u2014 when no function is accountable for data quality, reported numbers are structurally indefensible.',
    example:
      'Procurement tracks spend by supplier. Sustainability needs activity-based emission data. Finance tracks invoices. Nobody owns the mapping from supplier spend \u2192 emission factor \u2192 Scope 3 category. When the regulator asks who is accountable for the number, the answer is "nobody".',
    damaDmbok: 'KA2 \u2014 Data Architecture; KA3 \u2014 Data Modeling & Design',
    sectorStandard:
      'GHG Protocol Scope 3 Standard, 15 categories; ESRS E1 climate disclosure',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0.2,
      integration: 0.2,
      productivity: 0.3,
      regulatory: 0.3,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      60_000 * Math.max(1, input.sourceSystems * 0.3),
    remediation:
      'Assign Scope 3 data ownership to sustainability function with defined data contracts to procurement, operations, and finance. Align methodology to GHG Protocol category structure. Without clear ownership, data risk is unmanaged and regulatory exposure grows unchecked.',
    scannerCheck:
      'Identify Scope 3 data flows; map ownership gaps; flag categories with no assigned data source \u2014 each gap represents unmeasured compliance risk.',
  },
  {
    id: 'P3-U',
    propertyId: 'domainOwnership',
    sector: 'energy',
    title: 'SCADA/OT and IT Data Boundary Is Manual',
    description:
      'No structured domain ownership model between operational technology (SCADA, DCS, RTUs) and information technology (ERP, GIS, market systems).',
    example:
      'SCADA data needs to reach the trading system for dispatch decisions, but the boundary is a scheduled CSV export. Neither OT nor IT "owns" the translation.',
    damaDmbok: 'KA2 \u2014 Data Architecture; KA3 \u2014 Data Modeling & Design',
    sectorStandard:
      'ISA-95 / IEC 62264 (OT/IT integration framework); IEC 61850 (substation comms)',
    categoryWeights: {
      firefighting: 0.3,
      dataQuality: 0.2,
      integration: 0.3,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      70_000 * input.sourceSystems * 0.4,
    remediation:
      'Implement ISA-95 Level 3 integration layer with defined OT and IT domain boundaries. OPC UA companion specs provide the protocol. Each domain owns its model.',
    scannerCheck:
      'Map OT/IT data flows; identify manual boundary crossings; flag where scheduled file exports replace real-time integration.',
  },

  // =========================================================================
  // Property 4: Anti-Corruption Boundaries
  // =========================================================================
  {
    id: 'P4-M',
    propertyId: 'antiCorruption',
    sector: 'mining',
    title: 'Manual CSV/Excel Transformation in Production',
    description:
      'Production data workflows rely on manual CSV/Excel exports between systems with no validation, transformation, or error-detection layer.',
    example:
      'Geologist exports block model from Vulcan as CSV, manually reformats in Excel, emails to mine planner who imports into Deswik. "Final_v3_REAL_final.xlsx" is the production process.',
    damaDmbok: 'KA6 \u2014 Data Integration & Interoperability',
    sectorStandard:
      'Currently no standard \u2014 this IS the gap. OSDU for Mining targets this.',
    categoryWeights: {
      firefighting: 0.3,
      dataQuality: 0.3,
      integration: 0.2,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 52_000 * input.sourceSystems,
    remediation:
      'Implement validated data pipelines at every system boundary with schema contracts. Replace CSV workflows with API-based or event-driven integration with automated validation at ingestion.',
    scannerCheck:
      'Detect CSV/Excel files in shared drives that serve as integration artifacts; flag scheduled export jobs with no downstream validation.',
  },
  {
    id: 'P4-E',
    propertyId: 'antiCorruption',
    sector: 'environmental',
    title: 'ESG Reports Assembled Manually in Excel',
    description:
      'Sustainability reports assembled by manually pulling data from multiple systems into Excel workbooks with no automated validation or lineage tracking. Manual assembly means reported numbers are one spreadsheet error away from a material misstatement \u2014 a business risk that scales with regulatory scrutiny.',
    example:
      'Sustainability analyst pulls energy data from utility portal, waste data from contractor emails, water data from SCADA exports. Assembles in "ESG_Report_2025_v7_FINAL_reviewed.xlsx". Auditor asks for the data lineage. There is none. The report becomes a liability.',
    damaDmbok: 'KA6 \u2014 Data Integration & Interoperability',
    sectorStandard:
      'ODM2 adapters; ESRS XBRL digital reporting taxonomy',
    categoryWeights: {
      firefighting: 0.2,
      dataQuality: 0.3,
      integration: 0.2,
      productivity: 0,
      regulatory: 0.3,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 48_000 * input.sourceSystems,
    remediation:
      'Implement automated data pipelines from operational sources to reporting layer with ODM2-aligned adapters. ESRS XBRL taxonomy provides the target schema for output validation. Eliminates the manual assembly that creates material misstatement risk.',
    scannerCheck:
      'Identify manual data assembly patterns in ESG reporting workflows; detect Excel files with multiple external data sources and no automated refresh \u2014 each is an uncontrolled business risk.',
  },
  {
    id: 'P4-U',
    propertyId: 'antiCorruption',
    sector: 'energy',
    title: 'Scheduled CSV Export Between OT and IT',
    description:
      'Operational data moves from SCADA/DCS to enterprise systems via scheduled CSV/flat-file exports with no validation, transformation, or error-handling layer.',
    example:
      'SCADA exports 5-minute generation data as CSV every 15 minutes. If the export fails, nobody knows until the trading desk sees stale data. If a column is added upstream, downstream ETL breaks silently.',
    damaDmbok: 'KA6 \u2014 Data Integration & Interoperability',
    sectorStandard:
      'OPC UA companion specifications; IEC 61850 data exchange; CIM adapter pattern',
    categoryWeights: {
      firefighting: 0.4,
      dataQuality: 0.2,
      integration: 0.3,
      productivity: 0.1,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 65_000 * input.sourceSystems,
    remediation:
      'Replace scheduled CSV exports with OPC UA pub/sub or CIM-based API integration. Implement validation at every OT/IT boundary. CIM adapter pattern proven at 39+ European TSOs via CGMES.',
    scannerCheck:
      'Identify scheduled file transfer jobs between OT and IT zones; flag transfers with no validation or error-handling logic.',
  },

  // =========================================================================
  // Property 5: Schema Governance
  // =========================================================================
  {
    id: 'P5-M',
    propertyId: 'schemaGovernance',
    sector: 'mining',
    title: 'No Schema Versioning Across Mining Systems',
    description:
      'Schema changes in any system propagate silently. No version control, no change notification, no impact analysis. Downstream consumers discover changes when things break.',
    example:
      'Geology adds a new assay column to the drill hole database. Three mine planning reports break. Two environmental reports produce wrong numbers. Nobody knew the change was coming.',
    damaDmbok: 'KA1 \u2014 Data Governance; KA10 \u2014 Metadata Management',
    sectorStandard:
      'No established mining schema governance standard (this is the gap)',
    categoryWeights: {
      firefighting: 0.4,
      dataQuality: 0.2,
      integration: 0.2,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 35_000 * input.sourceSystems,
    remediation:
      'Implement schema registry with semantic versioning. Breaking changes flagged and communicated to downstream consumers before deployment. Data contracts between producers and consumers.',
    scannerCheck:
      'Compare current schema snapshots against historical versions; detect unreported column additions, type changes, or removals.',
  },
  {
    id: 'P5-E',
    propertyId: 'schemaGovernance',
    sector: 'environmental',
    title: 'No Schema Versioning for Evolving Standards',
    description:
      'ESG reporting standards evolve rapidly (ESRS taxonomy updates, GHG Protocol revisions) but internal data schemas are not versioned to track which standard version they implement. Unversioned schemas mean compliance gaps are invisible until they become enforcement events \u2014 the cost is not the schema change, it\u2019s the unmanaged regulatory exposure.',
    example:
      'ESRS taxonomy v2 adds 47 new data points in August 2026. Nobody knows which internal systems need to change. The sustainability team discovers the gap 3 weeks before the reporting deadline. The business risk was present for months \u2014 the data architecture made it invisible.',
    damaDmbok: 'KA1 \u2014 Data Governance; KA10 \u2014 Metadata Management',
    sectorStandard:
      'ESRS taxonomy versioning (annual releases); GHG Protocol revision history',
    categoryWeights: {
      firefighting: 0.2,
      dataQuality: 0.3,
      integration: 0,
      productivity: 0.2,
      regulatory: 0.3,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 42_000 * input.sourceSystems,
    remediation:
      'Maintain internal schema version aligned with external standard versions. Track which ESRS/GRI/ISSB version each data pipeline implements. Automate gap analysis when standards update. Makes regulatory exposure visible and manageable before it becomes an enforcement event.',
    scannerCheck:
      'Extract schema metadata; compare against current ESRS/GRI taxonomy versions; flag unimplemented data points that represent hidden compliance exposure.',
  },
  {
    id: 'P5-U',
    propertyId: 'schemaGovernance',
    sector: 'energy',
    title: 'Legacy System Format Mismatches',
    description:
      'Systems accumulated over decades use incompatible formats (GIS shapefiles, SAP IDocs, custom Oracle schemas, SCADA proprietary formats) with no governance over how they change.',
    example:
      'GIS team upgrades from shapefile to GeoPackage. SAP team changes field length on asset ID. Neither notifies downstream. Market settlement reports fail.',
    damaDmbok: 'KA1 \u2014 Data Governance; KA10 \u2014 Metadata Management',
    sectorStandard:
      'CIM CGMES versioning; IEC 61850 SCL configuration language',
    categoryWeights: {
      firefighting: 0.3,
      dataQuality: 0.2,
      integration: 0.3,
      productivity: 0.2,
      regulatory: 0,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) => 58_000 * input.sourceSystems,
    remediation:
      'Implement schema governance framework aligned with CIM CGMES versioning practices. Schema registry tracks all system formats. Change management process with downstream impact analysis.',
    scannerCheck:
      'Inventory all data format types across systems; detect version mismatches; flag systems with no documented schema history.',
  },

  // =========================================================================
  // Property 6: Continuous Quality Measurement
  // =========================================================================
  {
    id: 'P6-M',
    propertyId: 'continuousQuality',
    sector: 'mining',
    title: 'No Automated Data Quality Monitoring',
    description:
      'Data quality is assessed reactively \u2014 when a report is wrong, when an audit fails, when a regulator asks. No automated, continuous measurement of null rates, referential integrity, freshness, or schema conformance.',
    example:
      'Miscalibrated sensor produces invalid pH readings for 3 weeks. Discovered when the regulator asks about a discharge exceedance. Nobody was monitoring.',
    damaDmbok: 'KA11 \u2014 Data Quality',
    sectorStandard:
      'JORC compliance checks; NATA accreditation requirements (if applicable)',
    categoryWeights: {
      firefighting: 0.2,
      dataQuality: 0.4,
      integration: 0,
      productivity: 0.2,
      regulatory: 0.2,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      40_000 * input.sourceSystems * 0.6,
    remediation:
      'Implement automated data quality gates at every system boundary. Monitor null rates, referential integrity, freshness, and schema conformance continuously. Alert on threshold breaches. Assign accountability per quality dimension.',
    scannerCheck:
      'Measure null rates, referential integrity, freshness, and conformance across all accessible tables; produce quality scorecard per system.',
  },
  {
    id: 'P6-E',
    propertyId: 'continuousQuality',
    sector: 'environmental',
    title: 'No Data Provenance for Sustainability Claims',
    description:
      'No automated lineage tracking from source data (sensor readings, invoices, supplier reports) through transformations to published sustainability metrics. Claims cannot withstand audit scrutiny. The business risk is not the environmental data itself \u2014 it\u2019s that the data architecture cannot prove the numbers are reliable.',
    example:
      'Published emission figure of 12,847 tCO2e. Auditor asks: "Show me how you got this number." Team spends 3 weeks reconstructing the calculation from emails, spreadsheets, and memory. The cost is not the emission figure \u2014 it\u2019s the 3 weeks of executive time and the qualified audit report.',
    damaDmbok: 'KA11 \u2014 Data Quality; KA10 \u2014 Metadata Management',
    sectorStandard:
      'ESRS assurance requirements; GHG Protocol Scope 1/2/3 methodology; ISAE 3410 (assurance of GHG statements)',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0.3,
      integration: 0,
      productivity: 0.3,
      regulatory: 0.4,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      55_000 * input.sourceSystems * 0.5,
    remediation:
      'Implement automated data lineage from source instruments and documents through all transformations to published metrics. Every number in the sustainability report must trace to its origin. Required for CSRD assurance \u2014 without it, every published metric is an unmanaged liability.',
    scannerCheck:
      'Trace data lineage from published metrics back through transformations; flag where lineage is broken or undocumented \u2014 each break represents audit-qualification risk.',
  },
  {
    id: 'P6-U',
    propertyId: 'continuousQuality',
    sector: 'energy',
    title: 'No Real-Time Data Reconciliation',
    description:
      'No capability to reconcile data between systems in real time. AEMO 5-minute settlement requires near-real-time accuracy but reconciliation happens manually, days or weeks after the fact.',
    example:
      'SCADA reports 120 MW generation. Market system registers 118 MW. Billing calculates at 115 MW. Nobody reconciles until month-end when the trading desk spots a discrepancy.',
    damaDmbok: 'KA11 \u2014 Data Quality',
    sectorStandard:
      'AEMO 5-minute settlement requirements; CIM data exchange quality standards; ENTSO-E annual interoperability testing',
    categoryWeights: {
      firefighting: 0.3,
      dataQuality: 0.3,
      integration: 0.2,
      productivity: 0,
      regulatory: 0.2,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      60_000 * input.sourceSystems * 0.5,
    remediation:
      'Implement continuous reconciliation between SCADA, market, and billing systems. Automated alerts for discrepancies exceeding defined thresholds. Align with AEMO\u2019s 5MS data quality requirements.',
    scannerCheck:
      'Compare equivalent measurements across systems at matching timestamps; measure drift and flag persistent discrepancies.',
  },

  // =========================================================================
  // Property 7: Regulatory Traceability
  // =========================================================================
  {
    id: 'P7-M',
    propertyId: 'regulatoryTraceability',
    sector: 'mining',
    title: 'Regulatory Submissions Assembled Manually',
    description:
      'DMIRS/DMPE, EPA, and WHS regulatory submissions compiled manually from multiple sources. Single-person risk \u2014 one person knows how to assemble the report.',
    example:
      'Annual environmental report requires data from 7 systems. One geoenvironmental officer assembles it over 3 weeks in Excel. If they\u2019re sick, the submission is late. If they make an error, nobody catches it.',
    damaDmbok:
      'KA1 \u2014 Data Governance; KA10 \u2014 Metadata Management; KA5 \u2014 Data Security',
    sectorStandard:
      'DMIRS/DMPE reporting requirements; WA Auditor General recommendations (2022)',
    categoryWeights: {
      firefighting: 0.2,
      dataQuality: 0,
      integration: 0,
      productivity: 0.3,
      regulatory: 0.5,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      45_000 * input.sourceSystems * 0.4,
    remediation:
      'Automate regulatory report assembly from source systems. Implement lineage tracking so every reported number traces to source. Eliminate single-person dependency.',
    scannerCheck:
      'Map data flows into regulatory report templates; identify manual assembly steps; flag single-person dependencies.',
  },
  {
    id: 'P7-E',
    propertyId: 'regulatoryTraceability',
    sector: 'environmental',
    title: 'Greenwashing Exposure from Untraceable Claims',
    description:
      'Published sustainability claims (net zero targets, emission reductions, circular economy metrics) cannot be substantiated with traceable data. Regulatory enforcement is triggered by environmental data that cannot withstand audit scrutiny. The data architecture \u2014 not the environmental performance \u2014 is the failure. Barrick Gold did not lose $8.5B because of environmental damage; they lost it because their environmental data was unreliable, executives covered it up, and regulators shut them down.',
    example:
      'Annual report states "35% reduction in water intensity". Nobody can reproduce the calculation. ASIC asks for evidence. The baseline year used different methodology than the current year. The business cost is not the water intensity \u2014 it\u2019s the write-down, the CEO resignation, and the market cap loss when the data can\u2019t be defended.',
    damaDmbok: 'KA1 \u2014 Data Governance; KA10 \u2014 Metadata Management',
    sectorStandard:
      'ASIC Information Sheet 271 (greenwashing); CSRD assurance requirements; ISAE 3000/3410',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0,
      integration: 0,
      productivity: 0.2,
      regulatory: 0.8,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      Math.min(200_000, input.revenueAUD * 0.001) *
      input.sourceSystems *
      0.15,
    remediation:
      'Every published sustainability claim must trace to auditable source data with documented methodology. Implement CSRD-grade assurance readiness. Align claims to ESRS metrics definitions. The investment protects against write-downs, enforcement actions, and executive liability \u2014 not environmental outcomes.',
    scannerCheck:
      'Identify published sustainability metrics; trace each to source data; flag where methodology or baseline is undocumented \u2014 each untraceable claim is a quantifiable business liability.',
  },
  {
    id: 'P7-U',
    propertyId: 'regulatoryTraceability',
    sector: 'energy',
    title: 'Data Lineage Untraceable for Grid Operations',
    description:
      'No end-to-end lineage from sensor reading through SCADA through analytics to dispatch decision or regulatory report. Compliance demonstration is manual and unreliable.',
    example:
      'ERA audit asks how a specific dispatch instruction was derived. Team must manually reconstruct the path from weather forecast \u2192 load model \u2192 constraint engine \u2192 dispatch. Takes 2 weeks.',
    damaDmbok:
      'KA1 \u2014 Data Governance; KA10 \u2014 Metadata Management; KA5 \u2014 Data Security',
    sectorStandard:
      'AEMO compliance framework; AESCSF; ERA licence conditions',
    categoryWeights: {
      firefighting: 0.2,
      dataQuality: 0,
      integration: 0.2,
      productivity: 0.2,
      regulatory: 0.4,
      aiMlRiskExposure: 0,
    },
    costFunction: (input: DALCInput) =>
      50_000 * input.sourceSystems * 0.3,
    remediation:
      'Implement automated data lineage tracking from sensor through SCADA through analytics to market/regulatory outputs. Every dispatch decision and compliance report should trace to source data.',
    scannerCheck:
      'Trace data flows from regulatory submissions back through transformation layers to source systems; flag where lineage is incomplete.',
  },

  // =========================================================================
  // Property 8: AI Readiness
  // =========================================================================
  {
    id: 'P8-M',
    propertyId: 'aiReadiness',
    sector: 'mining',
    title: 'No Training Data Lineage for Autonomous Systems',
    description:
      'Autonomous haulage, predictive maintenance, and grade control models consume data with no documented lineage, no bias-attribute cataloguing, and no reproducible feature stores. When an autonomous vehicle incident triggers investigation, the training data provenance does not exist.',
    example:
      'Predictive maintenance model trained on 3 years of vibration sensor data. Sensor was recalibrated twice during that period — model doesn\'t know. Grade control AI uses assay data with undocumented lab methodology changes. Autonomous haul truck makes a routing decision nobody can explain.',
    damaDmbok: 'KA11 \u2014 Data Quality; KA10 \u2014 Metadata Management; KA5 \u2014 Data Security',
    sectorStandard:
      'Autonomous haulage data standards (Rio Tinto/BHP); OSDU ML-ready data profiles; ISO/IEC 5259',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0.1,
      integration: 0,
      productivity: 0,
      regulatory: 0.1,
      aiMlRiskExposure: 0.8,
    },
    costFunction: (input: DALCInput) =>
      45_000 * input.sourceSystems * 0.3,
    remediation:
      'Implement training data lineage for all ML models. Document bias-relevant attributes per EU AI Act Art 10. Version feature stores. Ensure model inputs satisfy ISO/IEC 5259 and NIST AI RMF requirements. Critical for autonomous systems where incident investigation requires full provenance.',
    scannerCheck:
      'Identify ML model artifacts; trace training data to source systems; flag where lineage is absent or bias attributes are undocumented.',
  },
  {
    id: 'P8-E',
    propertyId: 'aiReadiness',
    sector: 'environmental',
    title: 'ESG AI Models Lack Auditable Data Governance',
    description:
      'AI/ML models used for emissions prediction, compliance forecasting, and ESG scoring consume data with no documented governance. Model outputs feed regulatory submissions but training data lineage is untraceable. EU AI Act Art 10 mandates training data be "free of errors and complete" — the data architecture cannot demonstrate this.',
    example:
      'Emissions prediction model trained on 5 years of operational data. Methodology changed twice, supplier data quality degraded, and Scope 3 boundary expanded — model doesn\'t account for any of this. Published ESG score derived from AI model with no reproducible feature store. Auditor asks for the training data; it doesn\'t exist in auditable form.',
    damaDmbok: 'KA11 \u2014 Data Quality; KA10 \u2014 Metadata Management; KA5 \u2014 Data Security',
    sectorStandard:
      'ESG AI model governance (CSRD Art 29b); emissions model reproducibility; TNFD data lineage for nature-related AI; EU AI Act Art 10\u201313',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0.1,
      integration: 0,
      productivity: 0,
      regulatory: 0.2,
      aiMlRiskExposure: 0.7,
    },
    costFunction: (input: DALCInput) =>
      50_000 * input.sourceSystems * 0.25,
    remediation:
      'Implement AI data governance framework aligned with EU AI Act Art 10\u201313 and NIST AI RMF. Document training data lineage, bias attributes, and methodology versioning for all ESG-related models. Ensure feature stores are reproducible and auditable. AI failures in sustainability reporting trigger the same enforcement as underlying data failures.',
    scannerCheck:
      'Identify AI/ML models feeding ESG metrics; trace training data provenance; flag where Art 10 compliance gaps exist \u2014 each gap is a regulatory liability.',
  },
  {
    id: 'P8-U',
    propertyId: 'aiReadiness',
    sector: 'energy',
    title: 'Grid AI Models Operate Without Data Governance',
    description:
      'Grid optimisation, load forecasting, and trading algorithms consume data with no documented lineage or governance. Critical infrastructure decisions made by AI models whose training data provenance is unknown. AESCSF and AEMO frameworks require demonstrable data governance for AI systems.',
    example:
      'Load forecasting model trained on historical demand data — but the data includes COVID-period anomalies, tariff structure changes, and DER penetration shifts that are not labelled. Trading algorithm uses weather data from a provider that changed methodology. Grid stability AI makes a constraint decision based on data nobody can trace.',
    damaDmbok: 'KA11 \u2014 Data Quality; KA10 \u2014 Metadata Management; KA5 \u2014 Data Security',
    sectorStandard:
      'AEMO AI/ML data requirements; grid optimisation model validation (AESCSF); ENTSO-E AI interoperability standards; IEC 61968-100 AI extensions',
    categoryWeights: {
      firefighting: 0,
      dataQuality: 0.1,
      integration: 0.1,
      productivity: 0,
      regulatory: 0.1,
      aiMlRiskExposure: 0.7,
    },
    costFunction: (input: DALCInput) =>
      55_000 * input.sourceSystems * 0.3,
    remediation:
      'Implement AI data governance for all grid-facing models. Training data lineage must be traceable. Feature stores must be versioned and reproducible. Critical infrastructure AI requires demonstrable compliance with AESCSF and AEMO frameworks. Model validation must satisfy IEC 61968-100 AI extensions.',
    scannerCheck:
      'Identify AI/ML models in grid operations; trace training data to source systems; flag where governance gaps create critical infrastructure risk.',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Get all findings for a given sector.
 */
export function getFindingsForSector(sector: Sector): FindingDefinition[] {
  return FINDINGS.filter((f) => f.sector === sector);
}

/**
 * Get a single finding by ID.
 */
export function getFinding(id: string): FindingDefinition | undefined {
  return FINDINGS.find((f) => f.id === id);
}

/**
 * Get all findings for a given property.
 */
export function getFindingsForProperty(
  propertyId: string,
): FindingDefinition[] {
  return FINDINGS.filter((f) => f.propertyId === propertyId);
}
