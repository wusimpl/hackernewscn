import { initDatabase, closeDatabase } from './db/connection';
import {
  StoryRepository,
  TitleTranslationRepository,
  ArticleTranslationRepository,
  JobRepository,
  SettingsRepository,
} from './db/repositories';

async function testDatabase() {
  console.log('🧪 开始测试数据库...\n');

  try {
    // 初始化数据库
    await initDatabase();
    console.log('✅ 数据库初始化成功\n');

    // 测试 SettingsRepository
    console.log('📝 测试 SettingsRepository...');
    const settingsRepo = new SettingsRepository();
    await settingsRepo.set('test_key', 'test_value');
    const value = await settingsRepo.get('test_key');
    console.log(`   设置测试键: test_key = ${value}`);
    console.log('✅ SettingsRepository 测试通过\n');

    // 测试 StoryRepository
    console.log('📰 测试 StoryRepository...');
    const storyRepo = new StoryRepository();
    await storyRepo.upsert({
      story_id: 123456,
      title_en: 'Test Story',
      by: 'testuser',
      score: 100,
      time: Math.floor(Date.now() / 1000),
      url: 'https://example.com',
      descendants: 10,
    });
    const story = await storyRepo.findById(123456);
    console.log(`   创建故事: ${story?.title_en} (ID: ${story?.story_id})`);
    console.log('✅ StoryRepository 测试通过\n');

    // 测试 TitleTranslationRepository
    console.log('🌐 测试 TitleTranslationRepository...');
    const titleRepo = new TitleTranslationRepository();
    await titleRepo.upsert({
      story_id: 123456,
      title_en: 'Test Story',
      title_zh: '测试故事',
      prompt_hash: 'test_hash',
    });
    const translation = await titleRepo.findById(123456);
    console.log(`   翻译: ${translation?.title_en} → ${translation?.title_zh}`);
    console.log('✅ TitleTranslationRepository 测试通过\n');

    // 测试 ArticleTranslationRepository
    console.log('📄 测试 ArticleTranslationRepository...');
    const articleRepo = new ArticleTranslationRepository();
    await articleRepo.upsert({
      story_id: 123456,
      title_snapshot: 'Test Story',
      content_markdown: '# Test Content\n\nThis is a test article.',
      original_url: 'https://example.com',
      status: 'done',
    });
    const article = await articleRepo.findById(123456);
    console.log(`   文章状态: ${article?.status}`);
    console.log('✅ ArticleTranslationRepository 测试通过\n');

    // 测试 JobRepository
    console.log('🔄 测试 JobRepository...');
    const jobRepo = new JobRepository();
    const jobId = await jobRepo.create(123456, 'article', 'queued');
    const job = await jobRepo.findById(jobId);
    console.log(`   创建任务: ${job?.job_id} (类型: ${job?.type}, 状态: ${job?.status})`);
    console.log('✅ JobRepository 测试通过\n');

    console.log('🎉 所有测试通过!\n');

    // 清理测试数据
    console.log('🧹 清理测试数据...');
    await settingsRepo.delete('test_key');
    await storyRepo.delete(123456);
    console.log('✅ 清理完成\n');

    closeDatabase();
  } catch (error) {
    console.error('❌ 测试失败:', error);
    closeDatabase();
    process.exit(1);
  }
}

// 运行测试
testDatabase();
