export type SubjectSlug = "informatika" | "mentiq";

export type TopicDefinition = {
  slug: string;
  subjectSlug: SubjectSlug;
  numberLabel: string;
  name: string;
  parentNumberLabel?: string;
  sortOrder: number;
};

export const SUBJECT_CATALOG: { slug: SubjectSlug; name: string; sortOrder: number }[] = [
  { slug: "informatika", name: "İnformatika", sortOrder: 1 },
  { slug: "mentiq", name: "Məntiq", sortOrder: 2 },
];

const informatikaNames = [
  "İnformatika və Onun Əsas Anlayışları",
  "Say Sistemləri",
  "EHM (Hardware)",
  "Kompüterin Texniki Təminatı",
  "Alqoritm (Brainware)",
  "Proqram Təminatı (Software)",
  "Əməliyyat Sistemləri",
  "Windows 11",
  "MS Word 2019",
  "MS Excel 2019",
  "MS PowerPoint 2019",
  "Verilənlər Bazası (VBİS)",
  "MS Access 2019",
  "Kompüter Qrafikası",
  "Kompüter Şəbəkələri",
  "İnternet Qlobal Şəbəkələri",
  "Elektron Hökumət",
  "İnformasiya Təhlükəsizliyi",
];

const mentiqNames = [
  "Şifrələr",
  "Riyazi Əməllər",
  "Şəklin Analizi",
  "Əməllər (Qeyri-Aşkar Operatorlar)",
  "Şəkil Münasibətləri",
  "Ardıcıllıqlar",
  "Şəkil Ardıcıllıqları",
  "Mətnin Məntiqi Təhlili",
  "Rebus",
  "Şəkil Cədvəlləri",
  "Cədvəllər",
  "Analogiya-Anagram",
  "Hesab Əməlləri",
  "Tərəzilər",
  "Sahə-Perimetr",
  "Müstəvi Təsəvvür",
  "Cədvəl-Qrafik-Diaqram",
  "Fəza Fiqurları",
  "Tənqidi Mühakimə Məsələləri",
  "Riyazi Məsələlər",
];

export const TOPIC_CATALOG: TopicDefinition[] = [
  ...informatikaNames.map((name, index) => ({
    slug: `informatika-${index + 1}`,
    subjectSlug: "informatika" as const,
    numberLabel: String(index + 1),
    name,
    sortOrder: index + 1,
  })),
  ...mentiqNames.map((name, index) => ({
    slug: `mentiq-${index + 1}`,
    subjectSlug: "mentiq" as const,
    numberLabel: String(index + 1),
    name,
    sortOrder: index + 1,
  })),
  {
    slug: "mentiq-6-1",
    subjectSlug: "mentiq",
    numberLabel: "6.1",
    name: "Sıralar",
    parentNumberLabel: "6",
    sortOrder: 601,
  },
];

export const INFORMATICS_TOPICS = TOPIC_CATALOG.filter(topic => topic.subjectSlug === "informatika");
export const LOGIC_TOPICS = TOPIC_CATALOG.filter(
  topic => topic.subjectSlug === "mentiq" && !topic.parentNumberLabel,
);
