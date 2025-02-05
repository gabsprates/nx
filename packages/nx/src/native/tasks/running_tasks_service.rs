use crate::native::db::connection::NxDbConnection;
use napi::bindgen_prelude::External;

#[napi]
struct RunningTasksService {
    db: External<NxDbConnection>,
}

#[napi]
impl RunningTasksService {
    #[napi(constructor)]
    pub fn new(db: External<NxDbConnection>) -> anyhow::Result<Self> {
        let s = Self { db };

        s.setup()?;

        Ok(s)
    }

    #[napi]
    pub fn is_task_running(&self, task_id: String) -> anyhow::Result<bool> {
        let mut stmt = self.db.prepare("SELECT EXISTS(SELECT 1 FROM running_tasks WHERE task_id = ?)")?;
        let exists: bool = stmt.query_row([task_id], |row| row.get(0))?;
        Ok(exists)
    }

    #[napi]
    pub fn add_running_task(&self, task_id: String) -> anyhow::Result<()> {
        let mut stmt = self.db.prepare("INSERT INTO running_tasks (task_id) VALUES (?)")?;
        stmt.execute([task_id])?;
        Ok(())
    }

    #[napi]
    pub fn remove_running_task(&self, task_id: String) -> anyhow::Result<()> {
        let mut stmt = self.db.prepare("DELETE FROM running_tasks WHERE task_id = ?")?;
        stmt.execute([task_id])?;
        Ok(())
    }

    fn setup(&self) -> anyhow::Result<()> {
        self.db.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS running_tasks (
                task_id TEXT PRIMARY KEY NOT NULL
            );
            ",
        )?;
        Ok(())
    }
}
