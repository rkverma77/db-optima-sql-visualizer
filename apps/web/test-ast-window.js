const { Parser } = require("node-sql-parser");
const parser = new Parser();
const sql = `
WITH RankedProducts AS (
    SELECT
        name,
        category_id,
        rating,
        ROW_NUMBER() OVER(PARTITION BY category_id ORDER BY rating DESC) as rank
    FROM Products
)
SELECT
    name,
    category_id,
    rating
FROM RankedProducts
WHERE rank <= 2;
`;
try {
  const ast = parser.astify(sql);
  console.log("Success", ast);
} catch (e) {
  console.error("Parse Error:", e.message);
}
