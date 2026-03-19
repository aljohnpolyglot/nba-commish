import os

def list_files_to_txt(root_dir, output_filename="file_list.txt"):
    """
    Recursively lists all files in a directory tree and writes their paths to a text file.

    Args:
        root_dir (str): The starting directory path to walk.
        output_filename (str): The name of the output text file.
    """
    with open(output_filename, "w", encoding='utf-8') as f:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            for filename in filenames:
                # Construct the full file path
                full_path = os.path.join(dirpath, filename)
                # Write the path to the text file with a newline character
                f.write(str(full_path) + os.linesep)
    print(f"All file paths have been written to {output_filename}")

# --- Usage Example ---
# Specify the directory you want to start from.
# Use '.' for the current directory, or an absolute path like 'C:\\Users\\YourUser\\Documents'
directory_to_scan = '.' 

# Run the function
list_files_to_txt(directory_to_scan)
