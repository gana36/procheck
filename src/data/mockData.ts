import { ProtocolData, RecentSearch, SavedProtocol } from '@/types';

export const sampleQueries = [
  "Checklist for pediatric asthma, Mumbai 2024",
  "Dengue fever protocol Delhi guidelines",
  "COVID-19 treatment WHO protocol 2024",
  "Hypertension management steps ICMR",
  "Emergency cardiac arrest protocol",
  "Diabetes management checklist India"
];


export const mockRecentSearches: RecentSearch[] = [
  {
    id: '1',
    query: 'Pediatric asthma management protocol',
    timestamp: '2 hours ago',
    region: 'Mumbai',
    year: '2024'
  },
  {
    id: '2',
    query: 'Dengue fever treatment guidelines',
    timestamp: '1 day ago',
    region: 'Delhi',
    year: '2024'
  },
  {
    id: '3',
    query: 'COVID-19 isolation protocol',
    timestamp: '3 days ago',
    region: 'WHO',
    year: '2024'
  }
];

export const mockSavedProtocols: SavedProtocol[] = [
  {
    id: '1',
    title: 'Pediatric Asthma Management Checklist',
    organization: 'ICMR',
    savedDate: '2024-01-15',
    region: 'India',
    year: '2024'
  },
  {
    id: '2',
    title: 'Dengue Fever Treatment Protocol',
    organization: 'Delhi Health Department',
    savedDate: '2024-01-10',
    region: 'Delhi',
    year: '2024'
  }
];

export const generateMockProtocol = (query: string): ProtocolData => {
  const baseProtocol: ProtocolData = {
    title: 'Pediatric Asthma Management Protocol',
    region: 'Mumbai',
    year: '2024',
    organization: 'ICMR',
    steps: [
      {
        id: 1,
        step: 'Assess patient\'s respiratory status and oxygen saturation levels',
        citations: [1, 2],
        isNew: true,
        changes: 'Updated oxygen target ranges based on latest WHO guidelines'
      },
      {
        id: 2,
        step: 'Administer short-acting beta-2 agonist (SABA) via metered-dose inhaler or nebulizer',
        citations: [1, 3]
      },
      {
        id: 3,
        step: 'If no improvement, add anticholinergic medication (ipratropium bromide)',
        citations: [2, 4]
      },
      {
        id: 4,
        step: 'Consider systemic corticosteroids for moderate to severe exacerbations',
        citations: [1, 3, 5]
      },
      {
        id: 5,
        step: 'Monitor response to treatment and adjust therapy accordingly',
        citations: [2, 4]
      },
      {
        id: 6,
        step: 'Provide patient education on inhaler technique and asthma action plan',
        citations: [3, 5],
        isNew: true,
        changes: 'Enhanced digital resources for patient education'
      },
      {
        id: 7,
        step: 'Schedule follow-up within 48 hours for severe cases',
        citations: [1, 2, 5]
      }
    ],
    citations: [
      {
        id: 1,
        source: 'Global Initiative for Asthma (GINA) 2024 Guidelines',
        organization: 'GINA',
        year: '2024',
        region: 'Global',
        url: 'https://ginasthma.org',
        excerpt: 'Updated recommendations for pediatric asthma management focusing on personalized treatment approaches.'
      },
      {
        id: 2,
        source: 'Indian Council of Medical Research (ICMR) Asthma Guidelines',
        organization: 'ICMR',
        year: '2024',
        region: 'India',
        url: 'https://icmr.nic.in',
        excerpt: 'Comprehensive guidelines for asthma management in Indian pediatric population with regional considerations.'
      },
      {
        id: 3,
        source: 'World Health Organization (WHO) Essential Medicines List',
        organization: 'WHO',
        year: '2024',
        region: 'Global',
        url: 'https://who.int',
        excerpt: 'Updated list of essential medicines for respiratory conditions including pediatric formulations.'
      },
      {
        id: 4,
        source: 'American Academy of Pediatrics Asthma Guidelines',
        organization: 'AAP',
        year: '2024',
        region: 'US',
        url: 'https://aap.org',
        excerpt: 'Evidence-based recommendations for asthma management in children and adolescents.'
      },
      {
        id: 5,
        source: 'European Respiratory Society (ERS) Pediatric Asthma Guidelines',
        organization: 'ERS',
        year: '2024',
        region: 'UK',
        url: 'https://ersnet.org',
        excerpt: 'Comprehensive European guidelines for pediatric asthma diagnosis and treatment.'
      }
    ],
    lastUpdated: '2024-01-15'
  };

  // Modify based on query
  if (query.toLowerCase().includes('dengue')) {
    baseProtocol.title = 'Dengue Fever Treatment Protocol';
    baseProtocol.organization = 'Delhi Health Department';
    baseProtocol.steps = [
      {
        id: 1,
        step: 'Assess clinical signs and symptoms of dengue fever',
        citations: [1, 2]
      },
      {
        id: 2,
        step: 'Perform complete blood count and monitor platelet levels',
        citations: [1, 3]
      },
      {
        id: 3,
        step: 'Provide supportive care with adequate hydration',
        citations: [2, 4]
      },
      {
        id: 4,
        step: 'Monitor for warning signs of severe dengue',
        citations: [1, 3, 5]
      },
      {
        id: 5,
        step: 'Administer platelet transfusion if platelet count < 10,000/μL',
        citations: [2, 4],
        isNew: true,
        changes: 'Updated threshold based on recent clinical trials'
      },
      {
        id: 6,
        step: 'Provide patient education on mosquito bite prevention',
        citations: [3, 5]
      }
    ];
    baseProtocol.citations = [
      {
        id: 1,
        source: 'WHO Dengue Guidelines 2024',
        organization: 'WHO',
        year: '2024',
        region: 'Global',
        url: 'https://who.int',
        excerpt: 'Updated global guidelines for dengue fever diagnosis and management.'
      },
      {
        id: 2,
        source: 'Delhi Health Department Dengue Protocol',
        organization: 'Delhi Health Department',
        year: '2024',
        region: 'Delhi',
        excerpt: 'Regional protocol for dengue management adapted for Delhi conditions.'
      },
      {
        id: 3,
        source: 'ICMR Dengue Treatment Guidelines',
        organization: 'ICMR',
        year: '2024',
        region: 'India',
        excerpt: 'National guidelines for dengue fever treatment in India.'
      },
      {
        id: 4,
        source: 'CDC Dengue Clinical Guidelines',
        organization: 'CDC',
        year: '2024',
        region: 'US',
        excerpt: 'Clinical guidelines for dengue fever management and prevention.'
      },
      {
        id: 5,
        source: 'European Centre for Disease Prevention and Control',
        organization: 'ECDC',
        year: '2024',
        region: 'UK',
        excerpt: 'European guidelines for imported dengue fever cases.'
      }
    ];
  }

  return baseProtocol;
};
