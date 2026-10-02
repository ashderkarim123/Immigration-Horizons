import { EvidenceTemplate } from "../../src/lib/models/EvidenceTemplate";
import { addSample, emptyReport, type Migration } from "./types";

export const migration: Migration = {
  id: "004-seed-evidence-templates",
  description: "Seed initial evidence templates for EB-2 NIW and EB-1A",
  rationale: "Phase 05 evidence checklist requires base templates to provision evidence for new and existing cases.",

  async run({ dryRun }) {
    const report = emptyReport();

    const templates = [
      {
        key: "eb2_niw_base",
        name: "EB-2 NIW Canonical Evidence",
        description: "Base evidence requirements for EB-2 National Interest Waiver",
        caseType: "eb2_niw",
        version: 1,
        status: "active",
        publishedAt: new Date(),
        items: [
          {
            key: "niw_advanced_degree",
            title: "Advanced Degree or Exceptional Ability",
            description: "Proof of U.S. equivalent Master's degree or Exceptional Ability in the sciences, arts, or business.",
            importance: "required",
            section: "Basic Eligibility",
            order: 10,
            staffGuidance: "Usually satisfied by a degree evaluation or 3 out of 6 exceptional ability criteria.",
          },
          {
            key: "niw_proposed_endeavor",
            title: "Proposed Endeavor Statement",
            description: "Detailed statement describing the proposed endeavor and its substantial merit.",
            importance: "required",
            section: "National Interest",
            order: 20,
            clientGuidance: "Please provide a draft describing what you plan to do in the U.S.",
          },
          {
            key: "niw_recommendation_letters",
            title: "Independent Recommendation Letters",
            description: "Letters from independent experts attesting to the endeavor's importance and your past record of success.",
            importance: "required",
            section: "National Interest",
            order: 30,
            staffGuidance: "Aim for 3-5 strong independent letters.",
          },
          {
            key: "niw_publications",
            title: "Record of Publications",
            description: "Evidence of authorship of scholarly articles.",
            importance: "optional",
            section: "Supporting Evidence",
            order: 40,
          },
        ],
      },
      {
        key: "eb1a_base",
        name: "EB-1A Extraordinary Ability",
        description: "Base evidence requirements for EB-1A",
        caseType: "eb1a",
        version: 1,
        status: "active",
        publishedAt: new Date(),
        items: [
          {
            key: "eb1a_major_award",
            title: "Major, Internationally Recognized Award",
            description: "Evidence of receipt of a major, internationally recognized award (e.g., Nobel Prize, Oscar).",
            importance: "optional",
            section: "Criteria",
            order: 10,
            staffGuidance: "If this is met, no other criteria are needed. Usually not applicable.",
          },
          {
            key: "eb1a_lesser_awards",
            title: "Lesser Nationally/Internationally Recognized Prizes",
            description: "Documentation of receipt of lesser awards for excellence.",
            importance: "recommended",
            section: "Criteria",
            order: 20,
          },
          {
            key: "eb1a_membership",
            title: "Memberships in Associations",
            description: "Memberships requiring outstanding achievements of their members.",
            importance: "recommended",
            section: "Criteria",
            order: 30,
          },
          {
            key: "eb1a_published_material",
            title: "Published Material About You",
            description: "Published material in professional/major trade publications or major media about your work.",
            importance: "recommended",
            section: "Criteria",
            order: 40,
          },
        ],
      }
    ];

    for (const tpl of templates) {
      const existing = await EvidenceTemplate.findOne({ key: tpl.key, version: tpl.version }).lean();
      
      if (existing) {
        report.alreadyDone += 1;
        continue;
      }

      if (!dryRun) {
        await EvidenceTemplate.create(tpl);
      }
      
      report.changed += 1;
      addSample(report, `Created template ${tpl.key} v${tpl.version}`);
    }

    return report;
  },
};
