RESEARCH PROJECT CLEANUP / ARCHIVE PLAN
=========================================

Purpose
-------
This package reorganizes the local research_extract folder without deleting
the original database or validated research evidence.

IMPORTANT:
- Do NOT delete td_V2.db.
- Do NOT delete the final research_dataset CSV.
- Do NOT delete validated experiment outputs.
- Do NOT overwrite the validated scripts with older versions.
- Old/failed scripts are archived rather than immediately deleted so the
  provenance of the research remains available.

Recommended final structure
----------------------------

V2 db/
├── td_V2.db                         <-- ORIGINAL SOURCE DATABASE; KEEP
├── database_schema.csv              <-- KEEP
├── table_counts.csv                 <-- KEEP
│
└── research_extract/
    ├── 01_SOURCE/
    │   ├── README.md (if available)
    │   ├── database_schema.csv
    │   └── table_counts.csv
    │
    ├── 02_DATASETS/
    │   ├── candidate_dataset/
    │   │   ├── candidate_dataset.csv
    │   │   ├── candidate_commits.csv
    │   │   ├── candidate_missingness.csv
    │   │   └── candidate_project_summary.csv
    │   │
    │   └── research_dataset/
    │       ├── research_candidate_dataset.csv
    │       ├── research_missingness.csv
    │       ├── research_project_summary.csv
    │       └── smell_distribution.csv
    │
    ├── 03_AUDITS/
    │   ├── database/
    │   ├── alignment/
    │   ├── dataset/
    │   ├── changes/
    │   └── labels/
    │
    ├── 04_EXPERIMENTS/
    │   ├── temporal/
    │   ├── rolling/
    │   ├── lopo/
    │   └── szz_timing/
    │
    ├── 05_VALIDATED_SCRIPTS/
    │   ├── build_research_dataset.py
    │   ├── build_augmented_dataset_audit.py
    │   ├── audit_temporal_leakage.py
    │   ├── audit_szz_label_timing.py
    │   ├── audit_szz_censoring_profile.py
    │   ├── audit_change_features.py
    │   ├── audit_smell_reconstruction_fast.py
    │   ├── audit_alignment.py
    │   ├── run_augmented_temporal.py
    │   ├── run_augmented_rolling.py
    │   ├── analyze_augmented_rolling.py
    │   ├── run_augmented_lopo_fast.py
    │   └── analyze_augmented_lopo_seed42.py
    │
    ├── 06_ARCHIVE_OLD_OR_FAILED/
    │   ├── old_model_scripts/
    │   ├── old_lopo_scripts/
    │   ├── old_rolling_scripts/
    │   ├── old_temporal_scripts/
    │   └── diagnostics/
    │
    └── 07_FINAL_PAPER/
        ├── figures/
        ├── results_tables/
        ├── master_memo/
        └── paper_source/

Files that should NEVER be deleted
-----------------------------------
1. td_V2.db
2. research_dataset/research_candidate_dataset.csv
3. research_dataset/research_missingness.csv
4. research_dataset/research_project_summary.csv
5. candidate_dataset/candidate_dataset.csv
6. validated final experiment CSVs
7. validated scripts used to regenerate final results
8. alignment/audit evidence supporting smell reconstruction
9. SZZ timing/censoring audit outputs
10. the final paper source and figures

Files/folders safe to remove immediately
-----------------------------------------
- __pycache__/
- *.pyc
- unrelated .torrent files such as Nivalis_Nights_DODI_Repack_torrent
  (unless personally needed for an unrelated reason)
- duplicate temporary exports created only for inspection

Files that should NOT be deleted yet, but should be archived
-------------------------------------------------------------
These names indicate superseded/earlier experiment branches:
- run_temporal_models.py
- run_temporal_models_corrected.py
- run_rolling_temporal.py
- run_rolling_temporal_corrected.py
- run_lopo.py
- run_lopo_corrected.py
- temporal_model_results.csv
- temporal_split.csv
- temporal_corrected_*.csv
- rolling_temporal_*.csv
- rolling_corrected_*.csv
- lopo_corrected_*.csv
- older statistical_analysis.csv if it conflicts with the final 30-observation
  rolling analysis
- any script/output created before the final augmented workflow was validated

Reason:
-----------
These are part of the research history. Keeping them in an archive prevents
accidental use of obsolete numbers while preserving provenance.

SOURCE OF TRUTH
---------------
For the final paper, use only the final augmented experiment branch:
- augmented_temporal_results.csv
- augmented_temporal_summary.csv
- augmented_temporal_deltas.csv
- augmented_rolling_results.csv
- augmented_rolling_summary.csv
- augmented_rolling_deltas.csv
- augmented_rolling_statistical_analysis.csv
- augmented_lopo_seed42_results.csv
- augmented_lopo_seed42_deltas.csv
- augmented_lopo_seed42_statistical_analysis.csv
- augmented_lopo_seed42_skipped.csv
- szz_censoring_candidate_profile.csv
- szz_censoring_followup_profile.csv
- szz_label_timing_links.csv

Do NOT mix these with older temporal/rolling/LOPO outputs.

Final validated scripts
-----------------------
The validated final branch is:
1. build_research_dataset.py
2. run_augmented_temporal.py
3. run_augmented_rolling.py
4. analyze_augmented_rolling.py
5. run_augmented_lopo_fast.py
6. analyze_augmented_lopo_seed42.py
7. audit_szz_label_timing.py
8. audit_szz_censoring_profile.py
9. audit_temporal_leakage.py
10. audit_change_features.py
11. audit_smell_reconstruction_fast.py
12. build_augmented_dataset_audit.py

Before submission
-----------------
Make a ZIP backup of the entire organized research_extract directory.
Keep one untouched copy of td_V2.db separately.

Do not run old scripts simply because they are present.
If a future result is needed, regenerate it only with the validated scripts
and document the command and output filename.

The PowerShell script in this package performs MOVES only. It does not delete
the old scripts. Review the generated structure before deleting the archive.
