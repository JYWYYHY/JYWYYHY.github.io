// netlify/functions/get-submissions.js
exports.handler = async (event, context) => {
  // 1. 从环境变量中安全地读取凭证
  const NETLIFY_AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
  const FORM_ID = process.env.FORM_ID;

  if (!NETLIFY_AUTH_TOKEN || !FORM_ID) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '服务器环境变量配置不完整' }),
    };
  }

  try {
    // 2. 调用 Netlify 官方 API 获取表单提交
    const response = await fetch(`https://api.netlify.com/api/v1/forms/${FORM_ID}/submissions`, {
      headers: {
        'Authorization': `Bearer ${NETLIFY_AUTH_TOKEN}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Netlify API 响应错误: ${response.status}`);
    }

    const submissions = await response.json();

    // 3. 将数据返回给前端
    return {
      statusCode: 200,
      body: JSON.stringify(submissions),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '获取留言失败: ' + error.message }),
    };
  }
};