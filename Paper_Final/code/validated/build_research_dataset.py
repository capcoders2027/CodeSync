import sqlite3
import csv
import os
import json
from collections import defaultdict, Counter
from datetime import datetime

DB = r"D:\Capstone\new\V2 db\td_V2.db"
OUT = r"D:\Capstone\new\V2 db\research_extract\research_dataset"

os.makedirs(OUT, exist_ok=True)

con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
cur = con.cursor()


def save_csv(filename, headers, rows):
    path = os.path.join(OUT, filename)

    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)

    print(f"Created: {path}")


def parse_date(value):
    if not value:
        return None

    value = str(value)

    formats = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(value[:19], fmt)
        except Exception:
            pass

    return None


print("\n==============================================")
print("      BUILDING RESEARCH DATASET")
print("==============================================\n")


# =========================================================
# 1. SZZ LABELS
# =========================================================

print("1. Loading SZZ labels...")

szz_rows = cur.execute("""
    SELECT DISTINCT
        PROJECT_ID,
        FAULT_INDUCING_COMMIT_HASH
    FROM SZZ_FAULT_INDUCING_COMMITS
""").fetchall()

szz_set = set(szz_rows)

print("Unique SZZ labels:", len(szz_set))


# =========================================================
# 2. ALL GIT COMMITS
# =========================================================

print("\n2. Loading Git commits...")

commit_rows = cur.execute("""
    SELECT
        PROJECT_ID,
        COMMIT_HASH,
        COMMIT_MESSAGE,
        AUTHOR,
        AUTHOR_DATE,
        COMMITTER,
        COMMITTER_DATE,
        BRANCHES,
        IN_MAIN_BRANCH,
        MERGE,
        PARENTS
    FROM GIT_COMMITS
    WHERE COMMIT_HASH IS NOT NULL
""").fetchall()

print("Total Git commits:", len(commit_rows))


# =========================================================
# 3. PARSE COMMITS AND BUILD PARENT RELATIONSHIPS
# =========================================================

print("\n3. Building commit/parent relationships...")

commits = {}
commits_by_project = defaultdict(list)

eligible_base = []

for row in commit_rows:

    (
        project_id,
        commit_hash,
        message,
        author,
        author_date,
        committer,
        committer_date,
        branches,
        in_main_branch,
        merge,
        parents_raw
    ) = row

    parents = []

    if parents_raw:

        try:
            parsed = json.loads(
                str(parents_raw).replace("'", '"')
            )

            if isinstance(parsed, list):
                parents = parsed

        except Exception:
            pass

    commit_info = {
        "project": project_id,
        "hash": commit_hash,
        "message": message,
        "author": author,
        "author_date": author_date,
        "committer": committer,
        "committer_date": committer_date,
        "branches": branches,
        "main": in_main_branch,
        "merge": merge,
        "parents": parents,
    }

    commits[(project_id, commit_hash)] = commit_info

    commits_by_project[project_id].append(commit_info)


print("Commit records loaded:", len(commits))


# =========================================================
# 4. SONAR ANALYSES
# =========================================================

print("\n4. Loading Sonar analyses...")

analysis_rows = cur.execute("""
    SELECT
        PROJECT_ID,
        ANALYSIS_KEY,
        DATE,
        REVISION
    FROM SONAR_ANALYSIS
    WHERE REVISION IS NOT NULL
""").fetchall()

analysis_by_revision = {}
analyses_by_project = defaultdict(list)
analysis_by_key = {}

for project_id, analysis_key, date, revision in analysis_rows:

    info = {
        "project": project_id,
        "key": analysis_key,
        "date": date,
        "revision": revision,
        "datetime": parse_date(date),
    }

    analysis_by_revision[(project_id, revision)] = info
    analysis_by_key[(project_id, analysis_key)] = info
    analyses_by_project[project_id].append(info)


# Sort analyses chronologically within projects.

for project in analyses_by_project:

    analyses_by_project[project].sort(
        key=lambda x: (
            x["datetime"] is None,
            x["datetime"] or datetime.min,
            x["key"]
        )
    )


print("Sonar analyses:", len(analysis_rows))


# =========================================================
# 5. IDENTIFY ELIGIBLE TARGET COMMITS
# =========================================================

print("\n5. Selecting eligible target commits...")

eligible = []

for key, commit in commits.items():

    project = commit["project"]
    commit_hash = commit["hash"]
    parents = commit["parents"]

    # Exactly one parent.
    if len(parents) != 1:
        continue

    # Explicit merge exclusion.
    merge_value = str(commit["merge"]).lower().strip()

    if merge_value in ("1", "true", "yes"):
        continue

    parent_hash = parents[0]

    parent_analysis = analysis_by_revision.get(
        (project, parent_hash)
    )

    if parent_analysis is None:
        continue

    label = int(
        (project, commit_hash) in szz_set
    )

    commit_date = (
        commit["committer_date"]
        or commit["author_date"]
    )

    eligible.append({
        "project": project,
        "commit": commit_hash,
        "parent": parent_hash,
        "analysis_key": parent_analysis["key"],
        "analysis_date": parent_analysis["date"],
        "commit_date": commit_date,
        "label": label,
        "message": commit["message"],
        "author": commit["author"],
        "committer": commit["committer"],
        "main": commit["main"],
    })


print("Eligible commits:", len(eligible))
print(
    "SZZ positives:",
    sum(x["label"] for x in eligible)
)
print(
    "Non-SZZ:",
    len(eligible) - sum(x["label"] for x in eligible)
)


# =========================================================
# 6. DETERMINE WHICH ANALYSES ARE ACTUALLY NEEDED
# =========================================================

needed_analysis_keys = defaultdict(set)

for row in eligible:
    needed_analysis_keys[
        row["project"]
    ].add(row["analysis_key"])


print(
    "Parent analyses required:",
    sum(len(v) for v in needed_analysis_keys.values())
)


# =========================================================
# 7. RECONSTRUCT ACTIVE CODE-SMELL STATE
# =========================================================
#
# Each issue contributes:
#
# +1 at creation analysis
# -1 at closing analysis
#
# Therefore cumulative totals reconstruct the active
# smell population at every analysis.
#
# =========================================================

print("\n7. Reconstructing persistent smell state...")

issue_rows = cur.execute("""
    SELECT
        PROJECT_ID,
        ISSUE_KEY,
        CREATION_ANALYSIS_KEY,
        CLOSE_ANALYSIS_KEY,
        RULE,
        SEVERITY,
        COMPONENT
    FROM SONAR_ISSUES
    WHERE TYPE = 'CODE_SMELL'
""").fetchall()

print("Code-smell issue records:", len(issue_rows))


# Events indexed by:
#
# project -> analysis -> list of issue events

events = defaultdict(lambda: defaultdict(list))

for row in issue_rows:

    (
        project,
        issue_key,
        creation_key,
        close_key,
        rule,
        severity,
        component
    ) = row

    if creation_key is None:
        continue

    # Issue becomes active at creation.
    events[project][creation_key].append(
        (
            +1,
            issue_key,
            rule,
            severity,
            component
        )
    )

    # Issue ceases to be active when closed.
    if close_key:

        events[project][close_key].append(
            (
                -1,
                issue_key,
                rule,
                severity,
                component
            )
        )


# ---------------------------------------------------------
# Reconstruct state.
# ---------------------------------------------------------

smell_state = {}

for project, analyses in analyses_by_project.items():

    active_issues = {}
    active_rules = Counter()
    active_components = Counter()
    active_severity = Counter()

    for analysis in analyses:

        analysis_key = analysis["key"]

        for event in events[project].get(
            analysis_key,
            []
        ):

            (
                direction,
                issue_key,
                rule,
                severity,
                component
            ) = event

            if direction == 1:

                # Avoid double-counting the same issue.
                if issue_key in active_issues:
                    continue

                active_issues[issue_key] = (
                    rule,
                    severity,
                    component
                )

                if rule:
                    active_rules[rule] += 1

                if component:
                    active_components[component] += 1

                if severity:
                    active_severity[severity] += 1

            else:

                old = active_issues.pop(
                    issue_key,
                    None
                )

                if old is None:
                    continue

                old_rule, old_severity, old_component = old

                if old_rule:
                    active_rules[old_rule] -= 1

                if old_component:
                    active_components[old_component] -= 1

                if old_severity:
                    active_severity[old_severity] -= 1

        # Keep only analyses actually used by the candidate
        # dataset.
        if analysis_key in needed_analysis_keys.get(
            project,
            set()
        ):

            active_rule_count = sum(
                1
                for value in active_rules.values()
                if value > 0
            )

            active_component_count = sum(
                1
                for value in active_components.values()
                if value > 0
            )

            smell_state[
                (project, analysis_key)
            ] = {
                "active_smells": len(active_issues),

                "active_rules": active_rule_count,

                "active_components":
                    active_component_count,

                "blocker":
                    active_severity.get(
                        "BLOCKER", 0
                    ),

                "critical":
                    active_severity.get(
                        "CRITICAL", 0
                    ),

                "major":
                    active_severity.get(
                        "MAJOR", 0
                    ),

                "minor":
                    active_severity.get(
                        "MINOR", 0
                    ),

                "info":
                    active_severity.get(
                        "INFO", 0
                    ),
            }


print(
    "Reconstructed parent-analysis smell states:",
    len(smell_state)
)


# =========================================================
# 8. CONVENTIONAL SONAR METRICS
# =========================================================

print("\n8. Loading conventional Sonar metrics...")

metric_names = [
    "COMPLEXITY",
    "FILE_COMPLEXITY",
    "COMPLEXITY_IN_CLASSES",
    "CLASS_COMPLEXITY",
    "COMPLEXITY_IN_FUNCTIONS",
    "FUNCTION_COMPLEXITY",
    "COGNITIVE_COMPLEXITY",
    "COVERAGE",
    "LINE_COVERAGE",
    "DUPLICATED_LINES",
    "DUPLICATED_BLOCKS",
    "DUPLICATED_FILES",
    "DUPLICATED_LINES_DENSITY",
    "CLASSES",
    "FILES",
    "DIRECTORIES",
    "FUNCTIONS",
    "STATEMENTS",
    "COMMENT_LINES",
    "COMMENT_LINES_DENSITY",
    "LINES",
    "NCLOC",
    "AFFERENT_COUPLINGS",
    "EFFERENT_COUPLINGS",
    "NUMBER_OF_CLASSES_AND_INTERFACES",
    "PACKAGE_COUNT",
    "VIOLATIONS"
]

select_metrics = ", ".join(metric_names)

query = f"""
    SELECT
        PROJECT_ID,
        ANALYSIS_KEY,
        {select_metrics}
    FROM SONAR_MEASURES
"""

measure_rows = cur.execute(query).fetchall()

metrics_by_analysis = {}

for row in measure_rows:

    metrics_by_analysis[
        (row[0], row[1])
    ] = list(row[2:])


print(
    "Sonar metric analysis rows:",
    len(metrics_by_analysis)
)


# =========================================================
# 9. HISTORY FEATURES
# =========================================================
#
# IMPORTANT:
# Every feature here is computed from commits BEFORE the
# target commit.
#
# =========================================================

print("\n9. Building pre-commit history features...")

# Sort commits chronologically.

for project in commits_by_project:

    commits_by_project[project].sort(
        key=lambda x: (
            parse_date(
                x["committer_date"]
                or x["author_date"]
            ) is None,

            parse_date(
                x["committer_date"]
                or x["author_date"]
            ) or datetime.min
        )
    )


# Map commit -> chronological position.

commit_position = {}

for project, project_commits in commits_by_project.items():

    for index, commit in enumerate(project_commits):

        commit_position[
            (project, commit["hash"])
        ] = index


# SZZ positive history by project.
#
# Store both commit hash and timestamp so that the target commit
# itself can never be counted as a historical fault.

positive_dates = defaultdict(list)

for project, commit_hash in szz_set:

    commit = commits.get(
        (project, commit_hash)
    )

    if commit:

        date = parse_date(
            commit["committer_date"]
            or commit["author_date"]
        )

        if date:
            positive_dates[project].append(
                (date, commit_hash)
            )


for project in positive_dates:
    positive_dates[project].sort(
        key=lambda x: x[0]
    )


# Build author historical counts.

author_commit_counts = Counter()

history_features = {}


for row in eligible:

    project = row["project"]
    commit_hash = row["commit"]

    position = commit_position.get(
        (project, commit_hash)
    )

    if position is None:
        continue

    project_commits = commits_by_project[
        project
    ]

    previous = project_commits[:position]

    # ---------------------------------------------
    # Total previous commits
    # ---------------------------------------------

    total_previous = len(previous)

    # ---------------------------------------------
    # Previous 30 / 90 days
    # ---------------------------------------------

    current_date = parse_date(
        row["commit_date"]
    )

    commits_30 = 0
    commits_90 = 0

    if current_date:

        for previous_commit in reversed(previous):

            previous_date = parse_date(
                previous_commit["committer_date"]
                or previous_commit["author_date"]
            )

            if previous_date is None:
                continue

            delta = (
                current_date - previous_date
            ).days

            if delta < 0:
                continue

            if delta <= 30:
                commits_30 += 1

            if delta <= 90:
                commits_90 += 1

            if delta > 90:
                break

    # ---------------------------------------------
    # Recent historical SZZ faults
    # ---------------------------------------------

recent_faults_30 = 0
recent_faults_90 = 0

if current_date:

    for fault_date, fault_hash in reversed(
        positive_dates.get(project, [])
    ):

        # Never allow the target commit itself to become
        # a historical feature.
        if fault_hash == commit_hash:
            continue

        delta_seconds = (
            current_date - fault_date
        ).total_seconds()

        # Only strictly earlier commits are historical.
        # Same-timestamp and future commits are excluded.
        if delta_seconds <= 0:
            continue

        if delta_seconds <= 30 * 86400:
            recent_faults_30 += 1

        if delta_seconds <= 90 * 86400:
            recent_faults_90 += 1

        if delta_seconds > 90 * 86400:
            break

    # ---------------------------------------------
    # Time since previous commit
    # ---------------------------------------------

    days_since_previous = None

    if position > 0 and current_date:

        previous_commit = project_commits[
            position - 1
        ]

        previous_date = parse_date(
            previous_commit["committer_date"]
            or previous_commit["author_date"]
        )

        if previous_date:

            days_since_previous = (
                current_date - previous_date
            ).total_seconds() / 86400.0

    history_features[
        (project, commit_hash)
    ] = [
        total_previous,
        commits_30,
        commits_90,
        recent_faults_30,
        recent_faults_90,
        days_since_previous
    ]

# =========================================================
# DIAGNOSTIC: VERIFY ELIGIBLE ANALYSIS KEYS
# =========================================================

print("\nDIAGNOSTIC: Checking eligible analysis keys...")

missing_eligible_analysis = [
    row
    for row in eligible
    if not row.get("analysis_key")
]

invalid_eligible_analysis = [
    row
    for row in eligible
    if row.get("analysis_key")
    and (row["project"], row["analysis_key"]) not in analysis_by_key
]

print(
    "Eligible rows:",
    len(eligible)
)

print(
    "Eligible rows with missing analysis_key:",
    len(missing_eligible_analysis)
)

print(
    "Eligible rows with invalid analysis_key:",
    len(invalid_eligible_analysis)
)

if missing_eligible_analysis:
    print("\nFirst missing eligible row:")
    print(missing_eligible_analysis[0])

if invalid_eligible_analysis:
    print("\nFirst invalid eligible row:")
    print(invalid_eligible_analysis[0])
# =========================================================
# 10. BUILD FINAL DATASET
# =========================================================

print("\n10. Constructing final research candidate...")


headers = [
    "PROJECT_ID",
    "COMMIT_HASH",
    "PARENT_HASH",
    "PARENT_ANALYSIS_KEY",
    "PARENT_ANALYSIS_DATE",

    "IS_FAULT_INDUCING",

    # Basic historical metadata
    "AUTHOR",
    "AUTHOR_DATE",
    "COMMITTER_DATE",

    # History
    "PREVIOUS_COMMITS",
    "COMMITS_LAST_30_DAYS",
    "COMMITS_LAST_90_DAYS",
    "RECENT_FAULTS_LAST_30_DAYS",
    "RECENT_FAULTS_LAST_90_DAYS",
    "DAYS_SINCE_PREVIOUS_COMMIT",

    # Smells
    "ACTIVE_SMELLS",
    "ACTIVE_SMELL_RULES",
    "ACTIVE_SMELL_COMPONENTS",
    "ACTIVE_BLOCKER_SMELLS",
    "ACTIVE_CRITICAL_SMELLS",
    "ACTIVE_MAJOR_SMELLS",
    "ACTIVE_MINOR_SMELLS",
    "ACTIVE_INFO_SMELLS"
]

headers += metric_names


dataset = []

for row in eligible:

    key = (
        row["project"],
        row["commit"]
    )

    smell = smell_state.get(
        (
            row["project"],
            row["analysis_key"]
        ),
        {
            "active_smells": 0,
            "active_rules": 0,
            "active_components": 0,
            "blocker": 0,
            "critical": 0,
            "major": 0,
            "minor": 0,
            "info": 0
        }
    )

    history = history_features.get(
        key,
        [0, 0, 0, 0, 0, None]
    )

    metrics = metrics_by_analysis.get(
        (
            row["project"],
            row["analysis_key"]
        ),
        [None] * len(metric_names)
    )

    dataset_row = [
        row["project"],
        row["commit"],
        row["parent"],
        row["analysis_key"],
        row["analysis_date"],

        row["label"],

        row["author"],
        commits[(row["project"], row["commit"])]["author_date"],
        row["commit_date"],

        *history,

        smell["active_smells"],
        smell["active_rules"],
        smell["active_components"],
        smell["blocker"],
        smell["critical"],
        smell["major"],
        smell["minor"],
        smell["info"],

        *metrics
    ]

    dataset.append(dataset_row)


# =========================================================
# 11. STRUCTURAL VALIDATION
# =========================================================

print("\n11. Validating dataset structure...")

expected_columns = len(headers)

bad_rows = [
    (i, len(row))
    for i, row in enumerate(dataset)
    if len(row) != expected_columns
]

if bad_rows:

    raise RuntimeError(
        f"Invalid rows detected: {bad_rows[:10]}"
    )


keys = [
    (row[0], row[1])
    for row in dataset
]

duplicates = len(keys) - len(set(keys))

if duplicates:

    raise RuntimeError(
        f"Duplicate commit keys detected: {duplicates}"
    )


print("Rows:", len(dataset))
print("Columns:", len(headers))
print("Duplicate keys:", duplicates)
print("Structural validation: PASSED")


# =========================================================
# 12. SAVE
# =========================================================

save_csv(
    "research_candidate_dataset.csv",
    headers,
    dataset
)


# =========================================================
# 13. PROJECT SUMMARY
# =========================================================

print("\n12. Creating project summary...")

summary = defaultdict(
    lambda: {
        "rows": 0,
        "positive": 0
    }
)

for row in dataset:

    project = row[0]
    label = int(row[5])

    summary[project]["rows"] += 1
    summary[project]["positive"] += label


summary_rows = []

for project in sorted(summary):

    total = summary[project]["rows"]
    positive = summary[project]["positive"]

    summary_rows.append([
        project,
        total,
        positive,
        total - positive,
        positive / total if total else 0
    ])


save_csv(
    "research_project_summary.csv",
    [
        "PROJECT_ID",
        "ROWS",
        "POSITIVES",
        "NEGATIVES",
        "POSITIVE_RATE"
    ],
    summary_rows
)


# =========================================================
# 14. MISSINGNESS
# =========================================================

print("\n13. Creating missingness report...")

missing_rows = []

for index, column in enumerate(headers):

    missing = sum(
        1
        for row in dataset
        if row[index] is None
        or str(row[index]).strip() == ""
    )

    missing_rows.append([
        column,
        missing,
        len(dataset) - missing,
        missing / len(dataset)
        if dataset else 0
    ])


save_csv(
    "research_missingness.csv",
    [
        "FEATURE",
        "MISSING",
        "NON_MISSING",
        "MISSING_RATE"
    ],
    missing_rows
)


# =========================================================
# 15. SMELL DISTRIBUTION
# =========================================================

print("\n14. Creating smell distribution report...")

smell_index = headers.index(
    "ACTIVE_SMELLS"
)

positive_index = headers.index(
    "IS_FAULT_INDUCING"
)

smell_distribution = defaultdict(
    lambda: [0, 0]
)

for row in dataset:

    bucket = int(row[smell_index] or 0)
    label = int(row[positive_index])

    smell_distribution[bucket][0] += 1
    smell_distribution[bucket][1] += label


distribution_rows = []

for bucket in sorted(smell_distribution):

    total = smell_distribution[bucket][0]
    positives = smell_distribution[bucket][1]

    distribution_rows.append([
        bucket,
        total,
        positives,
        positives / total
        if total else 0
    ])


save_csv(
    "smell_distribution.csv",
    [
        "ACTIVE_SMELLS",
        "COMMITS",
        "SZZ_POSITIVES",
        "POSITIVE_RATE"
    ],
    distribution_rows
)


con.close()

print("\n==============================================")
print("       RESEARCH DATASET COMPLETE")
print("==============================================")
print("\nOutput folder:")
print(OUT)
print()