# 📊 Dataset Guidelines for ProCheck RAG System

## 🎯 Goal
Create **100 high-quality medical documents** that allow the LLM to **synthesize** intelligent responses, not just copy-paste.

---

## ✅ GOOD Data Format (RAW Information)

```json
{
  "disease": "dengue",
  "region": "India",
  "year": 2023,
  "organization": "NCVBDC",
  "title": "Dengue Symptoms and Clinical Presentation",
  "section": "Symptoms",
  "body": "Dengue fever typically presents with sudden onset of high fever (39-40°C), severe frontal headache, retro-orbital pain, myalgia, arthralgia, and maculopapular rash. The febrile phase lasts 2-7 days. Warning signs include abdominal pain, persistent vomiting, clinical fluid accumulation, mucosal bleeding, lethargy, and liver enlargement. Severe dengue is characterized by plasma leakage, hemorrhage, and organ impairment.",
  "source_url": "https://ncvbdc.mohfw.gov.in/...",
  "last_reviewed": "2023-06-15",
  "next_review_due": "2024-06-15"
}
```

**Why it works:**
- ✅ Raw medical facts
- ✅ LLM can extract, combine, and rephrase
- ✅ Allows intelligent synthesis
- ✅ Multiple documents can be merged

---

## ❌ BAD Data Format (Pre-formatted Protocols)

```json
{
  "disease": "dengue",
  "title": "Stepwise Dengue Protocol",
  "body": "1. Assess for fever and dengue symptoms; check travel history. 2. Order NS1, IgM ELISA, CBC. 3. Risk stratify: mild, moderate, severe. 4. Treat mild cases with paracetamol..."
}
```

**Why it fails:**
- ❌ Already formatted as steps
- ❌ LLM just copies verbatim
- ❌ No intelligence or synthesis
- ❌ Defeats the purpose of RAG

---

## 📚 Recommended Document Distribution (100 docs)

### **1. Dengue (20 docs)**
- Symptoms and presentation (4 docs)
- Diagnosis and lab tests (3 docs)
- Treatment guidelines (4 docs)
- Severe dengue management (3 docs)
- Prevention and vector control (3 docs)
- Pregnancy considerations (2 docs)
- Pediatric dengue (1 doc)

### **2. Malaria (15 docs)**
- Clinical presentation (3 docs)
- Diagnosis (microscopy, RDT) (3 docs)
- Treatment by type (P. falciparum, vivax) (4 docs)
- Severe malaria (2 docs)
- Prevention (prophylaxis, vector control) (3 docs)

### **3. Chikungunya (12 docs)**
- Symptoms and phases (3 docs)
- Diagnosis (2 docs)
- Management (3 docs)
- Chronic complications (2 docs)
- Prevention (2 docs)

### **4. Typhoid/Enteric Fever (10 docs)**
- Clinical features (3 docs)
- Diagnosis (2 docs)
- Antibiotic treatment (3 docs)
- Complications (2 docs)

### **5. COVID-19 (10 docs)**
- Symptoms by severity (3 docs)
- Testing and diagnosis (2 docs)
- Home care vs hospitalization (2 docs)
- Vaccination guidelines (2 docs)
- Long COVID (1 doc)

### **6. Respiratory Infections (8 docs)**
- Influenza (3 docs)
- Pneumonia (3 docs)
- TB screening (2 docs)

### **7. Gastrointestinal (8 docs)**
- Diarrheal diseases (3 docs)
- Food poisoning (2 docs)
- Hepatitis A/E (3 docs)

### **8. Vector-borne (7 docs)**
- Japanese Encephalitis (2 docs)
- Scrub Typhus (2 docs)
- Leptospirosis (2 docs)
- Zika (1 doc)

### **9. Pregnancy-related (5 docs)**
- Fever in pregnancy (2 docs)
- Gestational complications (2 docs)
- Safe medications (1 doc)

### **10. Emergency Protocols (5 docs)**
- Sepsis recognition (2 docs)
- Shock management (2 docs)
- Anaphylaxis (1 doc)

---

## 🎨 Document Structure Template

Each document should have:

```json
{
  "disease": "condition_name",          // e.g., "dengue", "malaria"
  "region": "India",                    // or "Global", "Delhi", "Maharashtra"
  "year": 2023,                         // Publication year
  "organization": "WHO",                // or "NCVBDC", "NHS", "CDC"
  "title": "Descriptive Title",         // e.g., "Dengue Fever Clinical Features"
  "section": "Category",                // "Symptoms", "Treatment", "Diagnosis", etc.
  "body": "DETAILED MEDICAL TEXT...",   // Raw information (NOT numbered lists!)
  "source_url": "https://...",          // Official source URL
  "last_reviewed": "2023-06-15",        // ISO date
  "next_review_due": "2024-06-15"       // ISO date
}
```

---

## ✍️ Writing the `body` Field

### ✅ DO:
- Write in **paragraph form** or **prose**
- Include specific details (temperatures, timeframes, doses)
- Use medical terminology appropriately
- Combine related information
- Keep each doc focused (150-300 words)

### ❌ DON'T:
- Use numbered lists (1, 2, 3...)
- Use bullet points (•, -, *)
- Create step-by-step protocols
- Copy-paste from existing checklists

---

## 📝 Example: Good Body Text

```
Dengue fever is caused by one of four dengue virus serotypes (DENV-1 to DENV-4) 
transmitted by Aedes aegypti mosquitoes. The incubation period ranges from 4-10 days. 

Clinical presentation includes sudden onset of high fever (typically 39-40°C), severe 
frontal headache, retro-orbital pain, myalgia, and arthralgia. A characteristic 
maculopapular rash may appear on days 3-5 of illness. 

The disease progresses through three phases: febrile (days 0-5), critical (days 5-7 
with potential plasma leakage), and convalescent (days 7-10). Warning signs indicating 
progression to severe dengue include abdominal pain, persistent vomiting, clinical 
fluid accumulation (ascites, pleural effusion), mucosal bleeding, lethargy, 
restlessness, liver enlargement >2cm, and rising hematocrit with rapid platelet decline.

Laboratory diagnosis involves NS1 antigen detection (days 0-5), IgM ELISA (day 5 
onwards), or RT-PCR for confirmation. Complete blood count shows thrombocytopenia 
(<100,000/mm³) and hemoconcentration (hematocrit rise ≥20%).
```

---

## 🔍 Where to Source Content

### Recommended Sources:
1. **WHO Fact Sheets** - https://www.who.int/health-topics
2. **CDC Guidelines** - https://www.cdc.gov/
3. **India NCVBDC** - https://ncvbdc.mohfw.gov.in/
4. **NHS UK** - https://www.nhs.uk/conditions/
5. **UpToDate** (if you have access)
6. **National Guidelines** (NVBDCP, ICMR)

### How to Extract:
1. Read the full guideline/fact sheet
2. Identify distinct topics (symptoms, diagnosis, treatment)
3. Create separate documents for each topic
4. Paraphrase and condense (don't copy verbatim)
5. Maintain medical accuracy

---

## 🚀 Quick Start: First 10 Documents

Start with these to test the system:

1. Dengue - Clinical Features
2. Dengue - NS1 and Serological Testing
3. Dengue - Fluid Management
4. Dengue - Warning Signs
5. Malaria - P. falciparum vs P. vivax
6. Malaria - Rapid Diagnostic Tests
7. COVID-19 - Mild vs Severe Symptoms
8. Chikungunya - Joint Pain Management
9. Typhoid - Diagnostic Approach
10. Pregnancy - Safe Fever Management

---

## 📊 Data Quality Checklist

Before indexing, verify each document has:
- [ ] Clear disease/condition name
- [ ] Specific region and year
- [ ] Credible organization source
- [ ] Body text is raw information (NOT numbered lists)
- [ ] Body length 150-300 words
- [ ] Valid source URL
- [ ] Accurate medical content

---

## 🎯 Success Criteria

After creating your dataset, test queries like:

1. **"dengue symptoms"** → LLM should synthesize from multiple symptom docs
2. **"malaria diagnosis"** → Should combine microscopy + RDT info
3. **"fever in pregnancy"** → Should filter to pregnancy-specific docs
4. **"severe dengue management"** → Should synthesize ICU care steps

If LLM is **still copying**, your `body` fields likely contain numbered lists!

---

## 💡 Pro Tips

1. **Batch by disease:** Create all dengue docs first, then malaria, etc.
2. **Use templates:** Copy the JSON structure for consistency
3. **Diverse sections:** Mix symptoms, diagnosis, treatment, prevention
4. **Regional variation:** Include India-specific and global guidelines
5. **Version control:** Note guideline year (2023 vs 2024)
6. **Test incrementally:** Index 10 docs, test, then continue

---

## 🔧 Indexing Your Data

Once you've created your JSON file:

```bash
cd /Users/karthik/Desktop/procheck/backend
source venv/bin/activate
python utils/index_documents.py data/medical_protocols_100.json
```

---

**Remember:** The goal is to give the LLM **raw ingredients** to cook with, not **pre-made meals** to serve!

