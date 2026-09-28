with open('/tmp/test_full.js', 'r') as f:
    replacement = f.read()

with open('/app-redesign.js', 'r') as f:
    code = f.read()

target_start = '  function PlanView({ personId, data, store, meta, updateData, showToast }) {'
target_end = '      h("div", { className: "hg-legacy-wrap" },\n        h(I.Et, { meta, personId, store, data, updateData, showToast })\n      )\n    );\n  }'

idx1 = code.find(target_start)
idx2 = code.find(target_end, idx1)

if idx1 == -1 or idx2 == -1:
    print('Failed to locate target chunk:', idx1, idx2)
    exit(1)

full_target = code[idx1 : idx2 + len(target_end)]
updated_code = code[:idx1] + replacement.strip() + code[idx2 + len(target_end):]

with open('/app-redesign.js', 'w') as f:
    f.write(updated_code)

print('Successfully injected ProgramWizardModal and PlanView!')
