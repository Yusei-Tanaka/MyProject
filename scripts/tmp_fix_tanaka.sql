START TRANSACTION;
UPDATE theme_version_payloads p
JOIN theme_versions tv ON tv.id=p.theme_version_id
JOIN themes t ON t.id=tv.theme_id AND tv.version_no=t.latest_version_no
SET p.content_json = REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(p.content_json,
'Non-renewable Energy','非再生可能エネルギー'),
'Renewable Energy','再生可能エネルギー'),
'Energy Crisis','エネルギー危機'),
'Energy Theory','エネルギー理論'),
'Biomass Power','バイオマス発電'),
'Hydropower','水力発電'),
'Nuclear Power','原子力発電'),
'Thermal Power','火力発電'),
'Solar Power','太陽光発電'),
'Supply Stability','供給安定性'),
'Local Consensus','地域合意'),
'System Design','システム設計'),
'Stability','安定性'),
'Cost','コスト'),
'Energy','エネルギー')
WHERE t.id=30;

UPDATE keyword_nodes kn
JOIN theme_versions tv ON tv.id=kn.theme_version_id
JOIN themes t ON t.id=tv.theme_id AND tv.version_no=t.latest_version_no
SET kn.label = CASE kn.label
  WHEN 'Non-renewable Energy' THEN '非再生可能エネルギー'
  WHEN 'Renewable Energy' THEN '再生可能エネルギー'
  WHEN 'Energy Crisis' THEN 'エネルギー危機'
  WHEN 'Energy Theory' THEN 'エネルギー理論'
  WHEN 'Biomass Power' THEN 'バイオマス発電'
  WHEN 'Hydropower' THEN '水力発電'
  WHEN 'Nuclear Power' THEN '原子力発電'
  WHEN 'Thermal Power' THEN '火力発電'
  WHEN 'Solar Power' THEN '太陽光発電'
  WHEN 'Supply Stability' THEN '供給安定性'
  WHEN 'Local Consensus' THEN '地域合意'
  WHEN 'System Design' THEN 'システム設計'
  WHEN 'Stability' THEN '安定性'
  WHEN 'Cost' THEN 'コスト'
  WHEN 'Energy' THEN 'エネルギー'
  ELSE kn.label
END
WHERE t.id=30;
COMMIT;
