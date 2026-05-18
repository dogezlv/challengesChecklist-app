#include <vector>
#include <fstream>
#include <iostream>
#include <string>
#include <sstream>
#include <algorithm>

std::string action_types [] = {
    "damage",
    "kill",
    "search",
    "visit",
    "land",
    "gain",
    "dance",
    "miscellaneous"
};

bool isPosValid(std::size_t pos) {
    return pos != std::string::npos;
}
std::size_t findPos(const std::string& line, const std::string& searchStr) {
    return line.find(searchStr);
}

std::vector<std::vector<std::string>> properties;

int main() {
	std::ifstream file("season8challenges_html.txt");
    std::ofstream output("season8challenges.txt");
	if (!file) {
		std::cerr << "Unable to open season8challenges_html.txt\n";
		return 1;
	}
	std::string line;
	while (std::getline(file, line)) {
		std::size_t pos = findPos(line, "|Quest=");
		if (isPosValid(pos)) {
            std::vector<std::string> line_properties;
            std::string newLine = line.substr(pos + 7);
            std::size_t start = newLine.find("[[");
            while(isPosValid(start)) {
                std::size_t end = newLine.find("]]", start+2);
                if (isPosValid(end)) {
                    line_properties.push_back(newLine.substr(start + 2, end - (start + 2)));
                    newLine.erase(start, 2);
                    newLine.erase(end-2, 2);
                } else {
                    break;
                }
                start = newLine.find("[[", start);
            }
            std::size_t stagePos = findPos(newLine, "(Stage ");
            if (isPosValid(stagePos)) {
                line_properties.push_back("progress");
                newLine = newLine.substr(17);
            }else{
                line_properties.push_back("simple");
            }
            properties.push_back(line_properties);
            output << newLine << std::endl;
		}
	}
    for(auto i : properties){
        for(auto j : i){
            std::cout << j << " | ";
        }
        std::cout << std::endl;
    }

	return 0;
}
