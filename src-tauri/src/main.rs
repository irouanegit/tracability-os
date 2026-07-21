use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

fn safe_pdf_file_name(file_name: &str) -> String {
    file_name
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            _ => character,
        })
        .collect::<String>()
}

fn safe_folder_name(folder_name: &str) -> String {
    folder_name
        .chars()
        .filter_map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => Some('-'),
            '.' => None,
            _ => Some(character),
        })
        .collect::<String>()
        .trim()
        .to_string()
}

fn unique_pdf_path(directory: &Path, file_name: &str) -> PathBuf {
    let safe_file_name = safe_pdf_file_name(file_name);
    let safe_path = PathBuf::from(&safe_file_name);
    let stem = safe_path
        .file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("export");
    let extension = safe_path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| value.eq_ignore_ascii_case("pdf"))
        .unwrap_or("pdf");
    let initial_path = directory.join(format!("{stem}.{extension}"));

    if !initial_path.exists() {
        return initial_path;
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);

    for counter in 1..1000 {
        let candidate = directory.join(format!("{stem}-{timestamp}-{counter}.{extension}"));
        if !candidate.exists() {
            return candidate;
        }
    }

    directory.join(format!("{stem}-{timestamp}.{extension}"))
}

#[tauri::command]
fn save_pdf_to_downloads(
    file_name: String,
    contents: String,
    sub_folder: Option<String>,
) -> Result<String, String> {
    let home_dir = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .ok_or_else(|| "Impossible de trouver le dossier utilisateur.".to_string())?;

    let mut downloads_dir = home_dir.join("Downloads");
    if let Some(sub_folder) = sub_folder {
        let safe_sub_folder = safe_folder_name(&sub_folder);
        if !safe_sub_folder.is_empty() {
            downloads_dir = downloads_dir.join(safe_sub_folder);
        }
    }
    fs::create_dir_all(&downloads_dir).map_err(|error| error.to_string())?;

    let path = unique_pdf_path(&downloads_dir, &file_name);

    fs::write(&path, contents.as_bytes()).map_err(|error| error.to_string())?;
    Ok(path.display().to_string())
}

#[tauri::command]
fn open_pdf_file(file_path: String) -> Result<(), String> {
    let path = fs::canonicalize(PathBuf::from(file_path)).map_err(|error| error.to_string())?;

    if !path.is_file() {
        return Err("Le fichier PDF est introuvable.".to_string());
    }

    let is_pdf = path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));

    if !is_pdf {
        return Err("Seuls les fichiers PDF peuvent etre ouverts depuis cette action.".to_string());
    }

    let status = open_file_with_system_viewer(&path)?;
    if status.success() {
        Ok(())
    } else {
        Err("Impossible d'ouvrir le fichier PDF.".to_string())
    }
}

#[cfg(target_os = "windows")]
fn open_file_with_system_viewer(path: &PathBuf) -> Result<std::process::ExitStatus, String> {
    Command::new("cmd")
        .args(["/C", "start", ""])
        .arg(path)
        .status()
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn open_file_with_system_viewer(path: &PathBuf) -> Result<std::process::ExitStatus, String> {
    Command::new("open")
        .arg(path)
        .status()
        .map_err(|error| error.to_string())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn open_file_with_system_viewer(path: &PathBuf) -> Result<std::process::ExitStatus, String> {
    Command::new("xdg-open")
        .arg(path)
        .status()
        .map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            save_pdf_to_downloads,
            open_pdf_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
