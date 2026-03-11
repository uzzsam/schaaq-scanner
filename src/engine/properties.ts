/**
 * DALC v4 Engine — Property Definitions
 * Engine codename: Archimedes
 *
 * The 7 properties of a well-architected data environment.
 * From Blueprint section 2.
 */

import type { PropertyDefinition } from './types';

export const PROPERTIES: PropertyDefinition[] = [
  {
    id: 'semanticIdentity',
    name: 'Semantic Identity Layer',
    definition:
      'Core entities (sites, assets, people, organisations, instruments, permits) have ONE canonical definition \u2014 a narrow identity register, not a massive enterprise model. Every system maps to it. When two systems disagree about what a "site" is, the identity layer resolves the conflict once.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management',
    sectorStandards: {
      mining: 'OSDU entity model, EarthResourceML MineralOccurrence/Mine',
      environmental: 'ODM2 SamplingFeature, Darwin Core Occurrence \u2014 standards that reduce entity-mismatch risk in regulatory reporting',
      energy: 'CIM IdentifiedObject (IEC 61970), IEC 61850 Logical Nodes',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'Same bore/well/site/location/hole_id defined differently in every system. No master register. Reconciliation manual or non-existent.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'People know it\u2019s a problem. Some teams maintain their own registers.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'A master register exists but is incomplete or inconsistently used.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Single entity register with most source systems mapped via adapters.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Single entity register. All sources map to it. New systems onboard by mapping to the register.',
      },
    ],
  },
  {
    id: 'controlledReference',
    name: 'Controlled Reference Data',
    definition:
      'Units of measure, classification codes, controlled vocabularies, and lookup tables \u2014 managed centrally, versioned, and distributed. When mining reports "ppm" and sustainability compliance reports "mg/L", the reference layer knows they\u2019re equivalent.',
    damaDmbok: 'KA8 \u2014 Reference & Master Data Management, KA11 \u2014 Data Quality',
    sectorStandards: {
      mining: 'GeoSciML vocabularies, JORC classification codes',
      environmental:
        'QUDT ontology (units), GHG Protocol emission factors, ESRS XBRL taxonomy \u2014 reference data integrity required to avoid audit qualification and regulatory exposure',
      energy: 'CIM measurement types, IEC unit codes',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'Different teams maintain their own lookup tables. Unit conversions embedded in ETL scripts or done manually.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'Some shared spreadsheets exist but are not authoritative.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'Central lookup tables exist but are not versioned or automatically distributed.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Central vocabulary service. Most systems reference shared controlled lists.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Central vocabulary service. All systems reference the same controlled lists. Changes versioned and propagated automatically.',
      },
    ],
  },
  {
    id: 'domainOwnership',
    name: 'Domain-Owned Data with Bounded Contexts',
    definition:
      'Each business domain (mine planning, fleet, sustainability compliance, grid operations) owns its data model. It doesn\u2019t get forced into a mega-schema. But it maps to the identity layer through adapters. A Person or a Contract are different things in different contexts \u2014 this is reality, not an implementation problem.',
    damaDmbok: 'KA2 \u2014 Data Architecture, KA3 \u2014 Data Modeling & Design',
    sectorStandards: {
      mining:
        'Domain separation between geology, mine planning, fleet, environmental, processing',
      environmental:
        'ODM2\u2019s domain-specific profiles for water quality, air quality, soil \u2014 domain boundaries that prevent cross-contamination of compliance-critical data',
      energy:
        'CIM\u2019s separation of transmission (61970), distribution (61968), metering (61869)',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'Monolithic schema attempting to model everything, or (more commonly) no shared model at all.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'Domains operate in isolation. People talk about "ownership" but nobody has it.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'Some domains have documented models but they don\u2019t connect.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Each domain has a well-defined model. Cross-domain queries go through shared layers.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Each domain owns and evolves its model. No domain\u2019s schema assumptions leak into another.',
      },
    ],
  },
  {
    id: 'antiCorruption',
    name: 'Anti-Corruption Boundaries',
    definition:
      'At every system boundary \u2014 where data moves between domains or between operational and analytical systems \u2014 there is a translation layer. It validates, transforms, and maps. It does not allow one system\u2019s schema assumptions to leak into another. THIS IS WHERE 80% OF THE IMPLEMENTATION EFFORT LIVES.',
    damaDmbok: 'KA6 \u2014 Data Integration & Interoperability',
    sectorStandards: {
      mining:
        'Currently absent \u2014 CSV/Excel is the boundary "protocol"',
      environmental: 'ODM2 adapters at source boundaries \u2014 validated integration that protects data integrity for regulatory submissions',
      energy:
        'CIM adapter pattern at TSO boundaries, OPC UA companion specs at OT/IT boundary',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'Manual CSV exports between systems. ETL scripts with embedded business logic. Direct database-to-database connections with no validation.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'People know CSV workflows are fragile. Some error checking exists.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'Some boundaries have documented transformation logic, but it\u2019s embedded in scripts.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Most system boundaries have documented adapters. Data contracts define what crosses each boundary.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Every boundary has a documented adapter. Validation runs at ingestion. Breaking changes are caught before propagation.',
      },
    ],
  },
  {
    id: 'schemaGovernance',
    name: 'Schema Governance',
    definition:
      'Schemas change through controlled, versioned processes. Semantic versioning. Breaking changes are flagged. Downstream consumers are notified. The "data contract" concept in the modern data stack is the current expression of this.',
    damaDmbok: 'KA1 \u2014 Data Governance, KA10 \u2014 Metadata Management',
    sectorStandards: {
      mining:
        'Currently absent \u2014 no versioning practice in common use',
      environmental:
        'ESRS taxonomy versioning (annual releases with change logs) \u2014 untracked schema changes create hidden compliance gaps that surface as enforcement events',
      energy:
        'FHIR versioning model (R4/R4B/R5/R6), CIM CGMES versioning',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'Silent breaking changes. No documentation of schema evolution.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'People know changes break things. Some informal notification.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'Schema documentation exists but is not versioned or enforced.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Schema registry exists. Version control. Some change impact analysis.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Schema registry. Semantic versioning. Change impact analysis before deployment. Data contracts between producers and consumers.',
      },
    ],
  },
  {
    id: 'continuousQuality',
    name: 'Continuous Quality Measurement',
    definition:
      'Data quality is measured automatically, continuously, at the boundary \u2014 not assessed annually by consultants. Null rates, referential integrity, freshness, schema conformance, duplicate detection.',
    damaDmbok: 'KA11 \u2014 Data Quality',
    sectorStandards: {
      mining:
        'JORC compliance checks (geological data quality)',
      environmental:
        'NATA accreditation requirements (lab data), discharge licence compliance \u2014 data quality failures here cost the business through licence conditions, not environmental outcomes',
      energy:
        'ENTSO-E annual interoperability testing, AEMO data quality requirements',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'Quality problems discovered when a report is wrong or an audit fails. No automated monitoring.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'People check quality manually before reports. Reactive.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'Some automated checks exist but are not comprehensive or monitored.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Automated quality gates at most boundaries. Dashboards. Alerts on threshold breaches.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Automated quality gates at every boundary. Continuous dashboards. Accountability assigned per dimension.',
      },
    ],
  },
  {
    id: 'regulatoryTraceability',
    name: 'Regulatory Traceability',
    definition:
      'Data structures are directly mappable to compliance requirements. When a regulator asks "show me how you calculated this emission figure," there is an unbroken chain from the reported number back through transformations to the source instrument reading.',
    damaDmbok:
      'KA1 \u2014 Data Governance, KA10 \u2014 Metadata Management, KA5 \u2014 Data Security',
    sectorStandards: {
      mining:
        'Environmental conditions of approval, DMIRS/DMPE reporting requirements (WA)',
      environmental:
        'ESRS disclosure requirements, GHG Protocol Scope 1/2/3 methodology \u2014 traceability failures trigger enforcement actions, write-downs, and executive liability',
      energy:
        'AEMO compliance framework, AESCSF (Australian Energy Sector Cyber Security Framework)',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'Regulatory submissions assembled manually in Excel. No lineage from reported numbers to source data. Audit preparation takes weeks.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'Some lineage documentation exists but is incomplete.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'Lineage documented for key regulatory reports but not automated.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Automated lineage for most regulatory pathways. Audit response in days.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Automated lineage from source to report. Regulatory mapping maintained as metadata. Audit response in hours.',
      },
    ],
  },
  {
    id: 'aiReadiness',
    name: 'AI Readiness',
    definition:
      'Data structures support machine-learning and AI workloads — training data lineage is traceable, bias-relevant attributes are documented, feature stores are reproducible, and model inputs satisfy regulatory requirements (EU AI Act Art 10–13, NIST AI RMF, ISO/IEC 5259). When an auditor asks "show me the training data for this model," the answer exists.',
    damaDmbok: 'KA11 — Data Quality, KA10 — Metadata Management, KA5 — Data Security',
    sectorStandards: {
      mining:
        'Autonomous haulage data standards (Rio Tinto/BHP), predictive maintenance feature stores, OSDU ML-ready data profiles',
      environmental:
        'ESG AI model governance (CSRD Art 29b), emissions model reproducibility, TNFD data lineage for nature-related AI — AI failures in sustainability reporting trigger the same enforcement as underlying data failures',
      energy:
        'AEMO AI/ML data requirements, grid optimisation model validation (AESCSF), ENTSO-E AI interoperability standards, IEC 61968-100 AI extensions',
    },
    maturitySpectrum: [
      {
        level: 0,
        label: 'Absent',
        description:
          'No training data lineage. Model inputs undocumented. Bias attributes unknown. AI projects use whatever data is available with no governance.',
      },
      {
        level: 1,
        label: 'Recognised',
        description:
          'People know AI data governance is needed. Some ad-hoc documentation for individual models.',
      },
      {
        level: 2,
        label: 'Defined',
        description:
          'Training data lineage documented for key models but not automated. Bias attributes partially catalogued.',
      },
      {
        level: 3,
        label: 'Managed',
        description:
          'Automated training data lineage for most models. Feature stores with versioning. Bias attributes documented per EU AI Act Art 10.',
      },
      {
        level: 4,
        label: 'Optimised',
        description:
          'Full training data lineage. Reproducible feature stores. Bias-attribute documentation automated. Model inputs satisfy EU AI Act Art 10–13, NIST AI RMF, and ISO/IEC 5259.',
      },
    ],
  },
];

/**
 * Lookup a property definition by ID.
 */
export function getProperty(id: string): PropertyDefinition | undefined {
  return PROPERTIES.find((p) => p.id === id);
}
